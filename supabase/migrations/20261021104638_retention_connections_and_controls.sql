-- Explicit profile-link connections and per-conversation notification controls.
-- Admission, mandatory nominations, live-location audiences and expiry are unchanged.
begin;

create table spotted_private.conversation_notification_preferences (
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('dm','plan')),
 conversation_id uuid not null,
 muted boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(user_id,kind,conversation_id)
);
alter table spotted_private.conversation_notification_preferences enable row level security;
revoke all on spotted_private.conversation_notification_preferences from public,anon,authenticated;

create function public.conversation_notification_preference(p_kind text,p_conversation uuid,p_muted boolean default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); result boolean;
begin
 if me is null or not spotted_private.launch_access() then raise exception 'Authentication required' using errcode='42501';end if;
 if p_kind is null or p_conversation is null or p_kind not in ('dm','plan') then raise exception 'Invalid conversation' using errcode='22023';end if;
 if (p_kind='dm' and not public.user_is_thread_member(p_conversation))
 or (p_kind='plan' and not spotted_private.plan_visible(me,p_conversation)) then
  raise exception 'Conversation unavailable' using errcode='42501';
 end if;
 if p_muted is not null then
  insert into spotted_private.conversation_notification_preferences(user_id,kind,conversation_id,muted)
  values(me,p_kind,p_conversation,p_muted) on conflict(user_id,kind,conversation_id)
  do update set muted=excluded.muted,updated_at=now();
 end if;
 select muted into result from spotted_private.conversation_notification_preferences where user_id=me and kind=p_kind and conversation_id=p_conversation;
 return coalesce(result,false);
end $$;
revoke all on function public.conversation_notification_preference(text,uuid,boolean) from public,anon;
grant execute on function public.conversation_notification_preference(text,uuid,boolean) to authenticated;

-- New reminder types have their own canonical, owner-only source contract.
alter function spotted_private.notification_source_visible(public.notifications) rename to notification_source_before_retention;
create function spotted_private.notification_source_visible(n public.notifications) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if n.type='morning_after' then
  return n.sender_id=n.receiver_id and not coalesce(n.is_demo,false)
   and exists(select 1 from public.profiles where id=n.receiver_id and not coalesce(is_demo,false))
   and exists(select 1 from public.night_recaps r where r.id=(n.data->>'recap_id')::uuid and r.user_id=n.receiver_id and r.expires_at>now() and not r.is_preview
    and (exists(select 1 from public.night_recap_stops where recap_id=r.id) or exists(select 1 from public.night_recap_photos where recap_id=r.id)));
 end if;
 return spotted_private.notification_source_before_retention(n);
exception when invalid_text_representation then return false;
end $$;
revoke all on function spotted_private.notification_source_visible(public.notifications),spotted_private.notification_source_before_retention(public.notifications) from public,anon,authenticated;

-- Do not remove inbox items when muting. This guard applies at enqueue and send.
alter function spotted_private.notification_allowed(public.notifications) rename to notification_before_conversation_controls;
create function spotted_private.notification_allowed(n public.notifications) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_conversation uuid; v_kind text;
begin
 if not spotted_private.notification_before_conversation_controls(n) then return false;end if;
 if n.type='weekend_rally' and not spotted_private.planning_reminder_eligible(n.receiver_id) then return false;end if;
 if n.type='morning_after' and not exists(select 1 from public.night_recaps r where r.id=(n.data->>'recap_id')::uuid
  and r.user_id=n.receiver_id and r.expires_at>now() and not r.is_preview
  and (exists(select 1 from public.night_recap_stops where recap_id=r.id) or exists(select 1 from public.night_recap_photos where recap_id=r.id))) then return false;end if;
 if n.type='dm' then v_kind:='dm';v_conversation:=(n.data->>'thread_id')::uuid;
 elsif n.type='plan_comment' then v_kind:='plan';v_conversation:=(n.data->>'plan_id')::uuid;
 else return true;end if;
 return not exists(select 1 from spotted_private.conversation_notification_preferences p
  where p.user_id=n.receiver_id and p.kind=v_kind and p.conversation_id=v_conversation and p.muted);
exception when invalid_text_representation then return false;
end $$;
revoke all on function spotted_private.notification_allowed(public.notifications),spotted_private.notification_before_conversation_controls(public.notifications) from public,anon,authenticated;

-- Preview is authenticated; requesting friendship is a separate explicit action.
-- This never admits a user, accepts a friendship, or shares their location.
create function public.connect_invitation(p_code text,p_request boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); invitation public.invite_codes; inviter public.profiles; friendship public.friendships;
 state text; requested boolean:=false;
begin
 if me is null or not spotted_private.launch_access() or coalesce(auth.jwt()->>'is_anonymous','false')='true'
 or exists(select 1 from public.profiles where id=me and coalesce(is_demo,false)) then raise exception 'Complete your invitation and onboarding first' using errcode='42501';end if;
 if p_code is null or upper(btrim(p_code)) !~ '^[A-HJ-NP-Z2-9]{8}$' then raise exception 'Invalid invitation code' using errcode='22023';end if;
 select * into invitation from public.invite_codes where code=upper(btrim(p_code))
  and (expires_at is null or expires_at>now()) for update;
 if invitation.id is null or invitation.user_id=me or spotted_private.blocked(me,invitation.user_id)
 or (invitation.max_uses is not null and coalesce(invitation.uses_count,0)>=invitation.max_uses
   and not exists(select 1 from public.invite_uses where invite_code_id=invitation.id and invited_user_id=me)) then
  raise exception 'This invitation is no longer available' using errcode='22023';
 end if;
 select * into inviter from public.profiles where id=invitation.user_id and not coalesce(is_demo,false);
 if inviter.id is null or not public.friendship_available(inviter.id) then raise exception 'This invitation is no longer available' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(me,inviter.id)::text||greatest(me,inviter.id)::text,41));
 select * into friendship from public.friendships where least(user_id,friend_id)=least(me,inviter.id) and greatest(user_id,friend_id)=greatest(me,inviter.id);
 if friendship.id is not null and friendship.status not in ('pending','accepted') then raise exception 'This connection is unavailable' using errcode='22023';end if;
 if friendship.id is null and coalesce(p_request,false) then
  insert into public.friendships(user_id,friend_id,status) values(me,inviter.id,'pending') returning * into friendship;
  requested:=true;
  -- Existing attribution is immutable; retrying a request cannot consume another use.
  perform pg_advisory_xact_lock(hashtextextended('referral:'||me::text,0));
  if not exists(select 1 from public.invite_uses where invited_user_id=me) then
   insert into public.invite_uses(invite_code_id,inviter_id,invited_user_id) values(invitation.id,inviter.id,me);
   update public.invite_codes set uses_count=coalesce(uses_count,0)+1 where id=invitation.id;
  end if;
 end if;
 state:=case when friendship.status='accepted' then 'friends'
  when friendship.status='pending' and friendship.user_id=me then 'requested'
  when friendship.status='pending' then 'incoming' else 'available' end;
 return jsonb_build_object('user_id',inviter.id,'display_name',inviter.display_name,'username',inviter.username,'avatar_url',inviter.avatar_url,'state',state,'request_created',requested);
end $$;
revoke all on function public.connect_invitation(text,boolean) from public,anon;
grant execute on function public.connect_invitation(text,boolean) to authenticated;

-- Latest user decision: keep individual friend/close-friend TBD and Out alerts.
create or replace function spotted_private.notify_night_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record; v_kind text; sender_name text; event uuid:=gen_random_uuid(); moving boolean:=false; recipient_expiry timestamptz;
begin
 if new.expires_at<=now() or new.status not in ('out','planning') or coalesce(new.is_demo,false) then return new;end if;
 if tg_op='UPDATE' then
  if old.status is not distinct from new.status and old.expires_at is not distinct from new.expires_at
   and old.venue_id is not distinct from new.venue_id and old.is_private_party is not distinct from new.is_private_party then return new;end if;
  moving:=old.status='out' and new.status='out' and old.expires_at=new.expires_at;
 end if;
 v_kind:=case when new.status='planning' then 'friend_planning' when moving then 'friend_arrived_venue' else 'friend_out' end;
 if moving and (new.venue_id is null or coalesce(new.is_private_party,false)) then return new;end if;
 if not spotted_private.night_mode_open_for(new.user_id) then return new;end if;
 select coalesce(nullif(btrim(display_name),''),'A friend') into sender_name from public.profiles where id=new.user_id;
 for recipient in
  select p.id,p.city,coalesce(pref.out_scope,'all') out_scope,coalesce(pref.moves_scope,'close') moves_scope,
    exists(select 1 from public.close_friends c where c.user_id=p.id and c.close_friend_id=new.user_id) is_close
  from public.profiles p left join public.notification_preferences pref on pref.user_id=p.id
  where p.id<>new.user_id and not coalesce(p.is_demo,false)
  and spotted_private.direct_friend(p.id,new.user_id)
  and spotted_private.viewer_participates(p.id) and spotted_private.night_mode_open_for(p.id)
  and spotted_private.location_audience(p.id,new.user_id,case when new.status='planning'
    then coalesce(new.planning_visibility,(select location_sharing_level from public.profiles where id=new.user_id),'all_friends')
    else (select location_sharing_level from public.profiles where id=new.user_id) end)
 order by p.id
 loop
  if (case when moving then recipient.moves_scope else recipient.out_scope end)='none'
    or ((case when moving then recipient.moves_scope else recipient.out_scope end)='close' and not recipient.is_close) then continue;end if;
  -- Serialize per-recipient event dedupe without suppressing other friends.
  recipient_expiry:=((public.night_start_at(recipient.city,now()) at time zone case recipient.city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end)+interval '1 day') at time zone case recipient.city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end;
  perform pg_advisory_xact_lock(hashtextextended('activity:'||recipient.id::text,0));
  -- Each eligible friend may notify. No recipient-wide cap or inter-friend cooldown.
  if not moving and exists(select 1 from spotted_private.activity_deliveries d
   where d.receiver_id=recipient.id and d.owner_id=new.user_id and d.night_expiry=recipient_expiry and d.kind=v_kind) then continue;end if;
  -- Keep the existing per-friend venue-move protection separate from TBD/Out.
  if moving and ((select count(*) from spotted_private.activity_deliveries d
    where d.receiver_id=recipient.id and d.owner_id=new.user_id and d.night_expiry=recipient_expiry and d.moving)>=3
   or exists(select 1 from spotted_private.activity_deliveries d where d.receiver_id=recipient.id
    and d.owner_id=new.user_id and d.moving and d.created_at>now()-interval '30 minutes')) then continue;end if;
  insert into spotted_private.activity_deliveries(owner_id,receiver_id,night_expiry,moving,kind) values(new.user_id,recipient.id,recipient_expiry,moving,v_kind);
  insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
  values(new.user_id,recipient.id,v_kind,sender_name||case when new.status='planning' then ' is making plans for tonight.'
    when new.venue_name is not null and not coalesce(new.is_private_party,false) then ' is Spotted at '||new.venue_name||'.' else ' is out tonight.' end,
    jsonb_build_object('actor_id',new.user_id,'night_expiry',new.expires_at::text,'venue_id',case when moving then new.venue_id else null end)
    ||case when new.status='out' and new.venue_id is not null and not coalesce(new.is_private_party,false)
      then jsonb_build_object('status_venue_id',new.venue_id::text) else '{}'::jsonb end,
    'status:'||event::text||':'||recipient.id::text) on conflict do nothing;
 end loop;
 return new;
end $$;

-- Durable, content-free facts for weekend cohorts and exact notification opens.
alter table spotted_private.usage_events drop constraint usage_events_event_check;
alter table spotted_private.usage_events add constraint usage_events_event_check check(event in (
 'session_open','plan_started','action_failed','notification_opened','plan_created','plan_response','plan_message','venue_saved','dm_sent','status_shared','notification_optout',
 'onboarding_complete','friend_request','friendship_accepted','invite_sent','invite_responded'));
alter table spotted_private.usage_events add column notification_type text, add column related_source_id uuid;
-- SELECT * in an existing view freezes its column list until refreshed.
create or replace view spotted_private.measured_usage with (security_invoker=true) as
 select e.* from spotted_private.usage_events e join public.profiles p on p.id=e.user_id
 where not coalesce(p.is_demo,false)
 and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=e.user_id)
 and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=e.user_id);
create unique index usage_notification_open_once on spotted_private.usage_events(user_id,entity_id)
 where event='notification_opened' and entity_id is not null;
create function public.record_notification_open(p_notification uuid) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); n public.notifications; related uuid;
begin
 if me is null or not spotted_private.launch_access() then raise exception 'Authentication required' using errcode='42501';end if;
 select * into n from public.notifications where id=p_notification and receiver_id=me;
 if n.id is null or not spotted_private.notification_source_visible(n) then return;end if;
 perform pg_advisory_xact_lock(hashtextextended('open:'||me::text||n.id::text,0));
 if exists(select 1 from spotted_private.usage_events where user_id=me and event='notification_opened' and entity_id=n.id) then return;end if;
 related:=case when n.type='dm' then (n.data->>'thread_id')::uuid when n.type in ('plan_invite','plan_down','plan_comment') then (n.data->>'plan_id')::uuid else (n.data->>'invite_id')::uuid end;
 perform spotted_private.record_usage(me,'notification_opened','notifications',n.id);
 update spotted_private.usage_events set notification_type=n.type,related_source_id=related
  where user_id=me and event='notification_opened' and entity_id=n.id;
exception when invalid_text_representation then return;
end $$;
revoke all on function public.record_notification_open(uuid) from public,anon;
grant execute on function public.record_notification_open(uuid) to authenticated;

create function spotted_private.record_retention_action() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='friendships' then
  if tg_op='INSERT' and new.status='pending' then perform spotted_private.record_usage(new.user_id,'friend_request',null,new.friend_id);end if;
  if new.status='accepted' and (tg_op='INSERT' or old.status is distinct from 'accepted') then
   perform spotted_private.record_usage(new.user_id,'friendship_accepted',null,new.friend_id);
   perform spotted_private.record_usage(new.friend_id,'friendship_accepted',null,new.user_id);
  end if;
 elsif tg_table_name='invites' then
  if tg_op='INSERT' then perform spotted_private.record_usage(new.sender_id,'invite_sent',null,new.id);
  elsif old.status='pending' and new.status in ('accepted','declined') then perform spotted_private.record_usage(new.receiver_id,'invite_responded',null,new.id);end if;
 elsif tg_table_name='launch_members' and new.completed_at is not null and (tg_op='INSERT' or old.completed_at is null) then
  perform spotted_private.record_usage(new.user_id,'onboarding_complete');
 end if;
 return new;
end $$;
create trigger retention_friendship after insert or update on public.friendships for each row execute function spotted_private.record_retention_action();
create trigger retention_invitation after insert or update on public.invites for each row execute function spotted_private.record_retention_action();
create trigger retention_onboarding after insert or update on spotted_private.launch_members for each row execute function spotted_private.record_retention_action();
revoke all on function spotted_private.record_retention_action() from public,anon,authenticated;

create table spotted_private.retention_measurement_settings(id boolean primary key default true check(id),started_at timestamptz not null default now());
alter table spotted_private.retention_measurement_settings enable row level security;
revoke all on spotted_private.retention_measurement_settings from public,anon,authenticated;
insert into spotted_private.retention_measurement_settings(id) values(true);
create function public.retention_report(p_days integer default 60) returns jsonb
language sql stable security definer set search_path='' as $$
 with members as (
  select m.user_id,m.completed_at,p.city,
   m.completed_at at time zone case p.city when 'la' then 'America/Los_Angeles' else 'America/New_York' end completed_local
  from spotted_private.launch_members m join public.profiles p on p.id=m.user_id
  where m.completed_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,60),90)))
   and m.completed_at>=(select started_at from spotted_private.retention_measurement_settings where id)
   and p.city in ('nyc','la') and not coalesce(p.is_demo,false)
   and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=m.user_id)
   and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=m.user_id)
 ), cohorts as (
  select *,case when completed_local<=date_trunc('week',completed_local)+interval '3 days 12 hours'
    then date_trunc('week',completed_local)+interval '3 days 12 hours'
    else date_trunc('week',completed_local)+interval '10 days 12 hours' end w0 from members
 ), meaningful as (
  select e.*,e.created_at at time zone case e.city when 'la' then 'America/Los_Angeles' else 'America/New_York' end local_at
  from spotted_private.measured_usage e where event in ('plan_created','plan_response','plan_message','dm_sent','status_shared','invite_sent','invite_responded')
   and e.created_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,60),90)))
 ), windows as (
  select c.*,k.week,c.w0+make_interval(days=>k.week*7) start_at,
   c.w0+make_interval(days=>k.week*7)+interval '2 days 17 hours' end_at
  from cohorts c cross join (values(0),(1),(2),(4)) k(week)
 ), matured as (
  select w.*,exists(select 1 from meaningful a where a.user_id=w.user_id and a.local_at>=w.start_at and a.local_at<w.end_at) returned
  from windows w where w.end_at<=now() at time zone case w.city when 'la' then 'America/Los_Angeles' else 'America/New_York' end
 ), report_rows as (
  select w0::date cohort_week,city,week,count(*) cohort_size,count(*) filter(where returned) active_users from matured group by w0::date,city,week
 ), action_attribution as (
  select distinct on(a.id) a.id,o.id opened_id
  from meaningful a join spotted_private.measured_usage o on o.user_id=a.user_id and o.event='notification_opened'
   and o.related_source_id=a.entity_id and a.created_at between o.created_at and o.created_at+interval '30 minutes'
  order by a.id,o.created_at desc
 )
 select jsonb_build_object(
  'window','Thursday 12:00 to Sunday 05:00 in profile-city time; first full window after onboarding is W0',
  'measurement_started_at',(select started_at from spotted_private.retention_measurement_settings where id),
  'cohorts',coalesce((select jsonb_agg(to_jsonb(r) order by cohort_week,city,week) from report_rows r),'[]'::jsonb),
  'notification_opens',(select count(*) from spotted_private.measured_usage where event='notification_opened' and entity_id is not null and created_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,60),90)))),
  'opens_followed_by_matching_action',(select count(distinct opened_id) from action_attribution),
  'note','Provider acceptance is not device delivery. Matching action is attribution, not causal lift. Existing users have no reconstructed pre-instrumentation history.'
 )
$$;
revoke all on function public.retention_report(integer) from public,anon,authenticated;
grant execute on function public.retention_report(integer) to service_role;

alter table public.notification_preferences alter column planning_days set default '{5}';
create table spotted_private.reminder_deliveries (
 user_id uuid not null references public.profiles(id) on delete cascade,
 week_date date not null,
 kind text not null check(kind in ('weekend_rally','morning_after')),
 created_at timestamptz not null default now(),
 primary key(user_id,week_date,kind)
);
alter table spotted_private.reminder_deliveries enable row level security;
revoke all on spotted_private.reminder_deliveries from public,anon,authenticated;

create function spotted_private.planning_reminder_eligible(p_user uuid,p_now timestamptz default now()) returns boolean
language sql stable security definer set search_path='' as $$
 with timing as (
  select (date_trunc('week',p_now at time zone case city when 'la' then 'America/Los_Angeles' else 'America/New_York' end)
   at time zone case city when 'la' then 'America/Los_Angeles' else 'America/New_York' end) week_start from public.profiles where id=p_user
 )
 select exists(select 1 from timing) and not exists(select 1 from public.night_statuses where user_id=p_user and expires_at>p_now)
 and not exists(select 1 from public.invites where receiver_id=p_user and status='pending' and expires_at>p_now)
 and not exists(select 1 from spotted_private.measured_usage e,timing t where e.user_id=p_user and e.created_at>=t.week_start and e.created_at<=p_now
  and e.event in ('plan_created','plan_response','plan_message','dm_sent','status_shared','invite_sent','invite_responded'))
 and not exists(select 1 from public.plans p where p.user_id=p_user and p.expires_at>p_now)
 and not exists(select 1 from public.plan_downs d join public.plans p on p.id=d.plan_id where d.user_id=p_user and p.expires_at>p_now)
$$;
revoke all on function spotted_private.planning_reminder_eligible(uuid,timestamptz) from public,anon,authenticated;

create or replace function public.enqueue_scheduled_pushes() returns integer
language plpgsql security definer set search_path='' as $$
declare p record; wall timestamp; kind text; added integer; total integer:=0; recap uuid;
begin
 if not exists(select 1 from spotted_private.push_settings where delivery_enabled and campaigns_enabled) then return 0;end if;
 for p in select u.id,u.city,pref.* from public.profiles u join public.notification_preferences pref on pref.user_id=u.id
 where u.push_enabled and not coalesce(u.is_demo,false) and u.city in ('nyc','la')
 and exists(select 1 from spotted_private.launch_members m where m.user_id=u.id and m.completed_at is not null)
 and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=u.id)
 and (u.apns_device_token is not null or u.push_subscription is not null) loop
  wall:=now() at time zone case p.city when 'la' then 'America/Los_Angeles' else 'America/New_York' end;
  if extract(minute from wall)>=15 then continue;end if;
  kind:=null;recap:=null;
  if p.planning_enabled and extract(hour from wall)=p.planning_hour and extract(isodow from wall) in (4,5)
   and extract(isodow from wall)::smallint=any(p.planning_days) and spotted_private.planning_reminder_eligible(p.id) then kind:='weekend_rally';
  elsif p.recap_enabled and extract(hour from wall)=12 and extract(isodow from wall) in (6,7) then
   select r.id into recap from public.night_recaps r where r.user_id=p.id and r.expires_at>now() and not r.is_preview
    and (exists(select 1 from public.night_recap_stops where recap_id=r.id) or exists(select 1 from public.night_recap_photos where recap_id=r.id))
    order by r.night_date desc limit 1;
   if recap is not null then kind:='morning_after';end if;
  end if;
  if kind is null then continue;end if;
  insert into spotted_private.reminder_deliveries(user_id,week_date,kind) values(p.id,date_trunc('week',wall)::date,kind) on conflict do nothing;
  get diagnostics added=row_count;if added=0 then continue;end if;
  insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
  values(p.id,p.id,kind,case when kind='morning_after' then 'Your private replay from last night is ready.' else 'Going out this weekend? Make a plan with your friends.' end,
   case when recap is null then '{}'::jsonb else jsonb_build_object('recap_id',recap) end,
   'weekly-reminder:'||kind||':'||p.id||':'||date_trunc('week',wall)::date) on conflict do nothing;
  get diagnostics added=row_count;total:=total+added;
 end loop;
 return total;
end $$;
-- Preserve the existing campaign kill switch. No sends are enabled by this migration.
select cron.schedule('spotted-reminder-ledger-cleanup','39 6 * * *','delete from spotted_private.reminder_deliveries where created_at<now()-interval ''90 days''');

commit;
