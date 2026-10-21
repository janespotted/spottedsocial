-- Approved UX priorities: preferences, bounded activity, plan chat and real usage.
-- No campaign activation, historic notification backfill or venue changes.
begin;
alter table public.notification_preferences
 add column messages_enabled boolean not null default true,
 add column planning_enabled boolean not null default false,
 add column recap_enabled boolean not null default false,
 add column planning_hour smallint not null default 17 check(planning_hour between 12 and 17),
 add column planning_days smallint[] not null default '{5,6}' check(cardinality(planning_days) between 0 and 7 and planning_days <@ array[1,2,3,4,5,6,7]::smallint[]);
alter table spotted_private.activity_deliveries add column kind text;
create index activity_deliveries_recipient_night on spotted_private.activity_deliveries(receiver_id,night_expiry,created_at);

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
  -- Lock recipients in a consistent order; concurrent friends cannot exceed the cap.
  recipient_expiry:=((public.night_start_at(recipient.city,now()) at time zone case recipient.city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end)+interval '1 day') at time zone case recipient.city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end;
  perform pg_advisory_xact_lock(hashtextextended('activity:'||recipient.id::text,0));
  if (select count(*) from spotted_private.activity_deliveries d where d.receiver_id=recipient.id and d.night_expiry=recipient_expiry)>=2
   or exists(select 1 from spotted_private.activity_deliveries d where d.receiver_id=recipient.id and d.created_at>now()-interval '60 minutes')
   or (not moving and exists(select 1 from spotted_private.activity_deliveries d where d.receiver_id=recipient.id and d.owner_id=new.user_id and d.night_expiry=recipient_expiry and d.kind=v_kind)) then continue;end if;
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
revoke all on function spotted_private.notify_night_activity() from public,anon,authenticated;


alter function spotted_private.notification_source_visible(public.notifications) rename to notification_source_before_ux;
create function spotted_private.notification_source_visible(n public.notifications) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare p public.plans;
begin
 if n.type='plan_comment' then
  if coalesce(n.is_demo,false) or spotted_private.blocked(n.sender_id,n.receiver_id) then return false;end if;
  select * into p from public.plans where id=(n.data->>'plan_id')::uuid;
  return p.id is not null and p.expires_at>now() and p.privacy_revision=(n.data->>'plan_revision')::timestamptz
   and spotted_private.plan_visible(n.receiver_id,p.id) and spotted_private.plan_visible(n.sender_id,p.id)
   and exists(select 1 from public.plan_comments c where c.id=(n.data->>'comment_id')::uuid and c.plan_id=p.id and c.user_id=n.sender_id);
 end if;
 return spotted_private.notification_source_before_ux(n);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;
end $$;

-- Same preferences are checked when queued AND just before delivery.
alter function spotted_private.notification_allowed(public.notifications) rename to notification_before_ux;
create function spotted_private.notification_allowed(n public.notifications) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare pref public.notification_preferences;
begin
 select * into pref from public.notification_preferences where user_id=n.receiver_id;
 if n.type in ('friend_out','friend_planning','friend_arrived_venue','friend_arrived','friend_checkin','friends_at_venue') then
  if not spotted_private.night_mode_open_for(n.sender_id) or not spotted_private.night_mode_open_for(n.receiver_id)
    or not spotted_private.wants_activity(n.receiver_id,n.sender_id,n.type not in ('friend_out','friend_planning')) then return false;end if;
 end if;
 if n.type in ('dm','plan_invite','plan_down','plan_comment','venue_invite','venue_invite_accepted','venue_invite_declined','meetup_request','meetup_accepted','meetup_declined','private_party_invite','address_request','party_invite_accepted','party_address_approved','friend_request','friend_accepted','invite_accepted')
 and not coalesce(pref.messages_enabled,true) then return false;end if;
 if n.type in ('daily_nudge_first','daily_nudge_second','weekend_rally') then
  return n.type='weekend_rally' and coalesce(pref.planning_enabled,false)
   and n.sender_id=n.receiver_id and not coalesce(n.is_demo,false)
   and exists(select 1 from public.profiles p where p.id=n.receiver_id and not coalesce(p.is_demo,false) and not public.is_night_mode(p.city))
   and exists(select 1 from spotted_private.push_settings where delivery_enabled and campaigns_enabled);
 end if;
 if n.type='morning_after' then
  return coalesce(pref.recap_enabled,false) and n.sender_id=n.receiver_id and not coalesce(n.is_demo,false)
   and exists(select 1 from spotted_private.push_settings where delivery_enabled and campaigns_enabled)
   and exists(select 1 from public.night_recaps r where r.user_id=n.receiver_id and r.expires_at>now() and not r.is_preview
    and (exists(select 1 from public.night_recap_stops where recap_id=r.id) or exists(select 1 from public.night_recap_photos where recap_id=r.id)));
 end if;
 if n.type='plan_comment' then return spotted_private.notification_source_visible(n);end if;
 return spotted_private.notification_before_ux(n);
end $$;

create function spotted_private.notify_plan_chat() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.plans; receiver uuid; sender_name text;
begin
 select * into p from public.plans where id=new.plan_id;
 if p.id is null or p.expires_at<=now() then return new;end if;
 select display_name into sender_name from public.profiles where id=new.user_id and not coalesce(is_demo,false);
 if sender_name is null then return new;end if;
 for receiver in select p.user_id union select user_id from public.plan_participants where plan_id=p.id union select user_id from public.plan_downs where plan_id=p.id loop
  if receiver=new.user_id or not spotted_private.plan_visible(receiver,p.id) or spotted_private.blocked(receiver,new.user_id) then continue;end if;
  insert into public.notifications(sender_id,receiver_id,type,message,data,event_key)
  values(new.user_id,receiver,'plan_comment',sender_name||' sent a message in your plan.',jsonb_build_object('plan_id',p.id,'plan_revision',p.privacy_revision,'comment_id',new.id),
  'plan-chat:'||new.id||':'||receiver) on conflict do nothing;
 end loop;
 return new;
end $$;
create trigger notify_plan_chat after insert on public.plan_comments for each row execute function spotted_private.notify_plan_chat();

-- Opt-in reminders. Leave the existing campaigns_enabled switch untouched.
create or replace function public.enqueue_scheduled_pushes() returns integer
language plpgsql security definer set search_path='' as $$
declare p record; wall timestamp; kind text; added integer; total integer:=0;
begin
 if not exists(select 1 from spotted_private.push_settings where delivery_enabled and campaigns_enabled) then return 0;end if;
 for p in select u.id,u.city,pref.* from public.profiles u join public.notification_preferences pref on pref.user_id=u.id
 where u.push_enabled and not coalesce(u.is_demo,false) and u.city in ('nyc','la')
 and exists(select 1 from spotted_private.launch_members m where m.user_id=u.id and m.completed_at is not null)
 and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=u.id)
 and (u.apns_device_token is not null or u.push_subscription is not null) loop
  wall:=now() at time zone case p.city when 'la' then 'America/Los_Angeles' else 'America/New_York' end;
  if extract(minute from wall)>=15 then continue;end if;
  kind:=null;
  if p.planning_enabled and extract(hour from wall)=p.planning_hour and extract(isodow from wall)::smallint=any(p.planning_days) then kind:='weekend_rally';
  elsif p.recap_enabled and extract(hour from wall)=10 and exists(select 1 from public.night_recaps r where r.user_id=p.id and r.expires_at>now() and not r.is_preview
   and (exists(select 1 from public.night_recap_stops where recap_id=r.id) or exists(select 1 from public.night_recap_photos where recap_id=r.id))) then kind:='morning_after';end if;
  if kind is null then continue;end if;
  insert into public.notifications(sender_id,receiver_id,type,message,event_key)
  values(p.id,p.id,kind,case when kind='morning_after' then 'Your private replay from last night is ready.' else 'Make a plan with friends for tonight.' end,
   'ux-reminder:'||kind||':'||p.id||':'||wall::date) on conflict do nothing;
  get diagnostics added=row_count;total:=total+added;
 end loop;
 return total;
end $$;

create or replace function public.match_contacts(p_phones text[])
returns table(phone text,user_id uuid,display_name text,username text,avatar_url text)
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); usage spotted_private.contact_match_usage;
 h timestamptz:=date_trunc('hour',now());d timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 phones text[]; amount integer;
begin
 if me is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' or not exists(select 1 from public.profiles where id=me and not coalesce(is_demo,false))
 then raise exception 'Authentication required' using errcode='42501';end if;
 if p_phones is null or cardinality(p_phones) not between 1 and 500
 or exists(select 1 from unnest(p_phones) p where p is null or p !~ '^\+?[1-9][0-9]{9,14}$')
 then raise exception 'Expected 1 to 500 valid phone numbers' using errcode='22023';end if;
 select array_agg(distinct ltrim(p,'+')) into phones from unnest(p_phones) p;
 amount:=cardinality(phones);
 insert into spotted_private.contact_match_usage(user_id,hour_start,day_start) values(me,h,d) on conflict do nothing;
 select * into usage from spotted_private.contact_match_usage where contact_match_usage.user_id=me for update;
 if usage.hour_start<>h then usage.hour_start:=h;usage.hour_requests:=0;usage.hour_numbers:=0;end if;
 if usage.day_start<>d then usage.day_start:=d;usage.day_requests:=0;usage.day_numbers:=0;end if;
 if usage.hour_requests>=20 or usage.day_requests>=40 or usage.hour_numbers+amount>1000 or usage.day_numbers+amount>2000
 then raise exception 'Contact matching limit reached; try later' using errcode='P0001';end if;
 update spotted_private.contact_match_usage set hour_start=h,day_start=d,
 hour_requests=usage.hour_requests+1,hour_numbers=usage.hour_numbers+amount,
 day_requests=usage.day_requests+1,day_numbers=usage.day_numbers+amount where contact_match_usage.user_id=me;
 return query select ltrim(u.phone,'+'),p.id,p.display_name,p.username,p.avatar_url
 from auth.users u join public.profiles p on p.id=u.id
 where ltrim(u.phone,'+')=any(phones) and p.id<>me and not coalesce(p.is_demo,false)
 and exists(select 1 from spotted_private.launch_members m where m.user_id=p.id and m.completed_at is not null)
 and not spotted_private.blocked(me,p.id);
end $$;
revoke all on function public.match_contacts(text[]) from public,anon;
grant execute on function public.match_contacts(text[]) to authenticated;

-- Internal measurement: no message text, contact numbers or GPS. Test accounts
-- can also be excluded explicitly by an operator, without changing profiles.
create table spotted_private.usage_exclusions(user_id uuid primary key references public.profiles(id) on delete cascade);
create table spotted_private.usage_events(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 event text not null check(event in ('session_open','plan_started','action_failed','notification_opened','plan_created','plan_response','plan_message','venue_saved','dm_sent','status_shared','notification_optout')),
 feature text check(feature is null or feature in ('plan','plan_chat','dm','venue','notifications','status')),
 entity_id uuid,
 mode text not null check(mode in ('day','night')),
 city text not null,
 night_date date not null,
 created_at timestamptz not null default now()
);
alter table spotted_private.usage_events enable row level security;
alter table spotted_private.usage_exclusions enable row level security;
revoke all on spotted_private.usage_events,spotted_private.usage_exclusions from public,anon,authenticated;
create index usage_events_user_time on spotted_private.usage_events(user_id,created_at);
create index usage_events_date on spotted_private.usage_events(created_at,event);
create function spotted_private.record_usage(p_user uuid,p_event text,p_feature text default null,p_entity uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare city text; zone text;
begin
 select p.city into city from public.profiles p where p.id=p_user and not coalesce(p.is_demo,false) and p.city in ('nyc','la')
 and exists(select 1 from spotted_private.launch_members m where m.user_id=p.id and m.completed_at is not null)
 and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=p.id)
 and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=p.id);
 if city is null then return;end if;
 zone:=case city when 'la' then 'America/Los_Angeles' else 'America/New_York' end;
 insert into spotted_private.usage_events(user_id,event,feature,entity_id,mode,city,night_date)
 values(p_user,p_event,p_feature,p_entity,case when public.is_night_mode(city) then 'night' else 'day' end,city,((now() at time zone zone)-interval '5 hours')::date);
end $$;
-- Client reports attempts/errors and opens; successful actions come from DB writes.
create function public.record_usage(p_event text,p_feature text default null) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null or not spotted_private.launch_access() then raise exception 'Authentication required' using errcode='42501';end if;
 if p_event not in ('session_open','plan_started','action_failed','notification_opened') or p_event is null
 or (p_feature is not null and p_feature not in ('plan','plan_chat','dm','venue','notifications','status')) then raise exception 'Unsupported event' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('usage:'||me::text,0));
 if (select count(*) from spotted_private.usage_events where user_id=me and created_at>now()-interval '1 minute')>=30 then return;end if;
 if p_event='session_open' and exists(select 1 from spotted_private.usage_events where user_id=me and event=p_event and created_at>now()-interval '30 minutes') then return;end if;
 perform spotted_private.record_usage(me,p_event,p_feature);
end $$;
revoke all on function public.record_usage(text,text) from public,anon;
grant execute on function public.record_usage(text,text) to authenticated;

create function spotted_private.record_product_action() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 case tg_table_name
 when 'plans' then perform spotted_private.record_usage(new.user_id,'plan_created','plan',new.id);
 when 'plan_downs' then perform spotted_private.record_usage(new.user_id,'plan_response','plan',new.plan_id);
 when 'plan_comments' then perform spotted_private.record_usage(new.user_id,'plan_message','plan_chat',new.plan_id);
 when 'wishlist_places' then perform spotted_private.record_usage(new.user_id,'venue_saved','venue');
 when 'dm_messages' then perform spotted_private.record_usage(new.sender_id,'dm_sent','dm',new.thread_id);
 when 'night_statuses' then
  if new.status in ('out','planning') and (tg_op='INSERT' or old.status is distinct from new.status or old.expires_at is distinct from new.expires_at) then
   perform spotted_private.record_usage(new.user_id,'status_shared','status');end if;
 when 'notification_preferences' then
  if (tg_op='INSERT' and (not new.messages_enabled or new.out_scope='none' or new.moves_scope='none')) or
   (tg_op='UPDATE' and ((old.messages_enabled and not new.messages_enabled) or (old.planning_enabled and not new.planning_enabled) or (old.recap_enabled and not new.recap_enabled)
   or (old.out_scope<>'none' and new.out_scope='none') or (old.moves_scope<>'none' and new.moves_scope='none'))) then
   perform spotted_private.record_usage(new.user_id,'notification_optout','notifications');end if;
 end case;
 return new;
end $$;
create trigger record_plan_created after insert on public.plans for each row execute function spotted_private.record_product_action();
create trigger record_plan_response after insert on public.plan_downs for each row execute function spotted_private.record_product_action();
create trigger record_plan_message after insert on public.plan_comments for each row execute function spotted_private.record_product_action();
create trigger record_venue_saved after insert on public.wishlist_places for each row execute function spotted_private.record_product_action();
create trigger record_dm_sent after insert on public.dm_messages for each row execute function spotted_private.record_product_action();
create trigger record_status_shared after insert or update on public.night_statuses for each row execute function spotted_private.record_product_action();
create trigger record_notification_optout after insert or update on public.notification_preferences for each row execute function spotted_private.record_product_action();

-- Aggregate report is service-only, includes no identities or event bodies.
create function public.usage_report(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz:=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),90)));
begin
 return jsonb_build_object(
 'since',since,
 'actions',coalesce((select jsonb_agg(to_jsonb(x)) from (select event,mode,count(*) events,count(distinct user_id) people from spotted_private.usage_events where created_at>=since group by event,mode order by event,mode) x),'[]'::jsonb),
 'plans_with_friend_reply',(select count(distinct p.entity_id) from spotted_private.usage_events p join spotted_private.usage_events r on r.entity_id=p.entity_id and r.user_id<>p.user_id and r.event in ('plan_response','plan_message') where p.event='plan_created' and p.created_at>=since),
 'people_returning_on_a_later_night',(select count(*) from (select user_id from spotted_private.usage_events where created_at>=since and event='session_open' group by user_id having count(distinct night_date)>1) x),
 'people_active_on_multiple_nights',(select count(*) from (select user_id from spotted_private.usage_events where created_at>=since and event='status_shared' group by user_id having count(distinct night_date)>1) x),
 'failures_by_feature',coalesce((select jsonb_agg(to_jsonb(x)) from (select feature,count(*) failures from spotted_private.usage_events where event='action_failed' and created_at>=since group by feature) x),'[]'::jsonb)
 );
end $$;
revoke all on function public.usage_report(integer) from public,anon,authenticated;
grant execute on function public.usage_report(integer) to service_role;
-- Keep a short history; aggregate reporting starts only after this release.
select cron.schedule('spotted-usage-cleanup','37 6 * * *','delete from spotted_private.usage_events where created_at<now()-interval ''90 days''');
revoke all on function spotted_private.record_usage(uuid,text,text,uuid),spotted_private.record_product_action(),spotted_private.notify_plan_chat(),spotted_private.notification_source_visible(public.notifications),spotted_private.notification_source_before_ux(public.notifications),spotted_private.notification_allowed(public.notifications),spotted_private.notification_before_ux(public.notifications) from public,anon,authenticated;
create or replace function public.nightly_reset()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_now timestamptz := now();
  v_conservative timestamptz := least(night_start_at('nyc', now()), night_start_at('la', now()));
  n int;
  result jsonb := '{}'::jsonb;
begin
  -- Morning After: snapshot each finished night BEFORE anything below
  -- closes check-ins, clears statuses or deletes posts. Its own savepoint,
  -- so a recap problem can never stop the reset.
  begin
    n := spotted_private.build_night_recaps(v_now);
    result := result || jsonb_build_object('built_recaps', n);
  exception when others then
    result := result || jsonb_build_object('recap_error', sqlerrm);
  end;

  update profiles p
     set is_out = false,
         last_known_lat = null,
         last_known_lng = null,
         last_location_at = null
   where p.is_out = true
     and (
       not exists (
         select 1 from night_statuses s
          where s.user_id = p.id and s.status = 'out' and s.expires_at > v_now
       )
       or p.last_location_at < night_start_at(p.city, v_now)
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_locations', n);

  update checkins c
     set ended_at = v_now
   where c.ended_at is null
     and not exists (
       select 1 from night_statuses s
        where s.user_id = c.user_id and s.status = 'out' and s.expires_at > v_now
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ended_checkins', n);

  delete from dm_messages m
   where m.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = m.sender_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_dms', n);

  delete from invites where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_invites', n);

  update night_statuses
     set status = 'home',
         venue_name = null,
         venue_id = null,
         lat = null,
         lng = null,
         expires_at = null,
         is_private_party = false,
         party_neighborhood = null,
         party_address = null,
         planning_neighborhood = null,
         planning_venue_id = null,
         planning_venue_name = null,
         planning_visibility = null
   where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_statuses', n);

  -- Belt and braces: the trigger above already drops a party spot when its
  -- status resets, but an orphaned row must never outlive its night.
  delete from party_locations where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_party_locations', n);

  delete from posts where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_posts', n);

  delete from yap_messages where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_yaps', n);

  delete from plans where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_plans', n);

  delete from notifications x
   where not (x.type in ('plan_invite','plan_down','plan_comment') and spotted_private.notification_source_visible(x))
   and x.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = x.receiver_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_notifications', n);

  -- Yesterday's recaps; their photo files go through the deletion queue.
  delete from night_recaps where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('expired_recaps', n);

  raise notice '[nightly_reset] %', result;
  return result;
end;
$function$;

-- ── 5. What the app calls ─────────────────────────────────────────────────
create or replace function public.get_night_recap()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); r public.night_recaps;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 select * into r from public.night_recaps where user_id=me and expires_at>now() order by night_date desc limit 1;
 if r.id is null then return null;end if;
 return jsonb_build_object(
  'id',r.id,'night_date',r.night_date,'expires_at',r.expires_at,
  'stops',coalesce((select jsonb_agg(jsonb_build_object('venue_id',s.venue_id,'venue_name',s.venue_name,
    'neighborhood',s.neighborhood,'arrived_at',s.arrived_at,'left_at',s.left_at) order by s.position)
   from public.night_recap_stops s where s.recap_id=r.id),'[]'::jsonb),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'storage_key',p.storage_key,'width',p.width,
    'height',p.height,'thumbhash',p.thumbhash,'source',p.source) order by p.taken_at)
   from public.night_recap_photos p where p.recap_id=r.id),'[]'::jsonb),
  -- Read-time check: someone unfriended or blocked since the reset drops out.
  'people',coalesce((select jsonb_agg(jsonb_build_object('friend_id',x.friend_id,'display_name',pr.display_name,
    'avatar_url',pr.avatar_url,'venue_id',x.venue_id,'venue_name',x.venue_name) order by x.overlap_start)
   from public.night_recap_people x join public.profiles pr on pr.id=x.friend_id
   where x.recap_id=r.id and spotted_private.direct_friend(me,x.friend_id)),'[]'::jsonb));
end $$;
commit;
