-- Extend the existing private usage ledger and founder dashboard. No new database.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

create function spotted_private.measurement_eligible(u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=u and not coalesce(p.is_demo,false) and p.city in ('nyc','la'))
 and not exists(select 1 from spotted_private.usage_exclusions where user_id=u)
 and not exists(select 1 from spotted_private.night_mode_testers where user_id=u);
$$;
revoke all on function spotted_private.measurement_eligible(uuid) from public,anon,authenticated;

alter table spotted_private.launch_monitor_settings add column command_center_started_at timestamptz not null default now();
alter table spotted_private.usage_events
 add column client_event_id uuid,
 add column session_id uuid,
 add column surface text check(surface in ('home','map','hot_spots','plans','activity','messages','friends','profile','venue','onboarding','other')),
 add column duration_ms integer check(duration_ms between 0 and 120000),
 add column outcome text check(outcome in ('ok','rejected','server_error','network_error')),
 add column received_at timestamptz not null default now();
create index usage_session_time on spotted_private.usage_events(user_id,session_id,created_at) where session_id is not null;
create unique index usage_client_dedupe on spotted_private.usage_events(user_id,client_event_id) where client_event_id is not null;
alter table spotted_private.usage_events drop constraint usage_events_event_check;
alter table spotted_private.usage_events add constraint usage_events_event_check check(event in (
 'session_open','plan_started','action_failed','notification_opened','plan_created','plan_response','plan_message',
 'venue_saved','dm_sent','status_shared','notification_optout','onboarding_complete','friend_request',
 'friendship_accepted','invite_sent','invite_responded','checkin_created','post_created','post_comment','post_like',
 'screen_view','venue_selected','friend_discovered','onboarding_view','api_request','group_created'));
-- Keep the historical filtered view compatible; new columns are read through eligibility checks below.

create table spotted_private.app_sessions(
 user_id uuid not null references public.profiles(id) on delete cascade,
 id uuid not null,
 started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 ended_at timestamptz,
 foreground_seconds numeric not null default 0,
 primary key(user_id,id)
);
create index app_sessions_recent on spotted_private.app_sessions(last_seen_at);
alter table spotted_private.app_sessions enable row level security;
revoke all on spotted_private.app_sessions from public,anon,authenticated;

-- Presence is never replayed from an offline queue. Server timestamps only.
create function spotted_private.touch_app_session(p_session uuid,p_foreground boolean) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); old_session spotted_private.app_sessions; city text;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_session is null or p_foreground is null then raise exception 'Invalid session' using errcode='22023';end if;
 if not spotted_private.measurement_eligible(u) then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,7312));
 select * into old_session from spotted_private.app_sessions where user_id=u and id=p_session for update;
 if not found then
  -- Tombstone an out-of-order end so a late start cannot resurrect presence.
  if not p_foreground then
   insert into spotted_private.app_sessions(user_id,id,ended_at) values(u,p_session,now());
   return;
  end if;
  if (select count(*) from spotted_private.app_sessions where user_id=u and started_at>now()-interval '1 minute')>=10 then return;end if;
  insert into spotted_private.app_sessions(user_id,id) values(u,p_session);
  -- One foreground segment = one measured session. Existing 30-minute opens stay separate.
  select p.city into city from public.profiles p where p.id=u;
  insert into spotted_private.usage_events(user_id,event,session_id,city,mode,night_date)
   values(u,'session_open',p_session,city,case when public.is_night_mode(city) then 'night' else 'day' end,
    ((now() at time zone case city when 'la' then 'America/Los_Angeles' else 'America/New_York' end)-interval '5 hours')::date);
 else
  if old_session.ended_at is not null then return;end if;
  update spotted_private.app_sessions set last_seen_at=now(),ended_at=case when not p_foreground then now() end,
   foreground_seconds=foreground_seconds+case when now()-last_seen_at<=interval '45 seconds' then greatest(0,extract(epoch from now()-last_seen_at)) else 0 end
  where user_id=u and id=p_session;
 end if;
end $$;
revoke all on function spotted_private.touch_app_session(uuid,boolean) from public,anon;
grant execute on function spotted_private.touch_app_session(uuid,boolean) to authenticated;
create function public.touch_app_session(p_session uuid,p_foreground boolean) returns void
language sql security invoker set search_path='' as $$select spotted_private.touch_app_session(p_session,p_foreground);$$;
revoke all on function public.touch_app_session(uuid,boolean) from public,anon;
grant execute on function public.touch_app_session(uuid,boolean) to authenticated;

-- Fixed vocabulary, bounded offline retry, stable event IDs. No raw URLs, text, GPS or contacts.
create function spotted_private.record_command_events(p_events jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e jsonb; city text; at_time timestamptz; ev text; sf text;
begin
 if u is null then raise exception 'Authentication required' using errcode='42501';end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>40 or p_events is null then raise exception 'Invalid event batch' using errcode='22023';end if;
 if not spotted_private.measurement_eligible(u) then return;end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,7313));
 if (select count(*) from spotted_private.usage_events where user_id=u and client_event_id is not null and received_at>now()-interval '1 minute')>=300 then
  raise exception 'Measurement limit reached' using errcode='54000';
 end if;
 select p.city into city from public.profiles p where p.id=u;
 for e in select value from jsonb_array_elements(p_events) loop
  ev:=e->>'event'; sf:=e->>'surface';
  if jsonb_typeof(e)<>'object' or e-'id'-'event'-'at'-'session'-'surface'-'duration_ms'-'outcome'<>'{}'::jsonb
   or ev is null or ev not in ('screen_view','venue_selected','friend_discovered','onboarding_view','api_request')
   or sf is null or sf not in ('home','map','hot_spots','plans','activity','messages','friends','profile','venue','onboarding','other')
   or e->>'id' is null or e->>'at' is null or e->>'session' is null
   or (ev='api_request' and (e->>'outcome' is null or e->>'duration_ms' is null))
   or (ev<>'api_request' and (e ? 'outcome' or e ? 'duration_ms')) then
   raise exception 'Unsupported measurement' using errcode='22023';
  end if;
  at_time:=(e->>'at')::timestamptz;
  if at_time<now()-interval '24 hours' or at_time>now()+interval '1 minute' then continue;end if;
  at_time:=least(at_time,now());
  insert into spotted_private.usage_events(user_id,event,client_event_id,session_id,surface,duration_ms,outcome,city,mode,night_date,created_at)
   values(u,ev,(e->>'id')::uuid,(e->>'session')::uuid,sf,(e->>'duration_ms')::integer,e->>'outcome',city,
    case when public.is_night_mode(city,at_time) then 'night' else 'day' end,
    ((at_time at time zone case city when 'la' then 'America/Los_Angeles' else 'America/New_York' end)-interval '5 hours')::date,at_time)
   on conflict(user_id,client_event_id) where client_event_id is not null do nothing;
 end loop;
end $$;
revoke all on function spotted_private.record_command_events(jsonb) from public,anon;
grant execute on function spotted_private.record_command_events(jsonb) to authenticated;
create function public.record_command_events(p_events jsonb) returns void language sql security invoker set search_path='' as $$select spotted_private.record_command_events(p_events);$$;
revoke all on function public.record_command_events(jsonb) from public,anon;
grant execute on function public.record_command_events(jsonb) to authenticated;

create function spotted_private.record_group_creation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.is_group then perform spotted_private.record_usage(new.created_by,'group_created','dm');end if;
 return new;
exception when others then raise warning 'launch_monitor_capture_failed: %',sqlstate;return new;
end $$;
revoke all on function spotted_private.record_group_creation() from public,anon,authenticated;
create trigger monitor_group_created after insert on public.dm_threads for each row execute function spotted_private.record_group_creation();

create function spotted_private.command_center(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare base jsonb; extra jsonb; since timestamptz; began timestamptz;
begin
 base:=spotted_private.launch_monitor_live(p_days);
 since:=(base->>'since')::timestamptz;
 select started_at into began from spotted_private.retention_measurement_settings where id;
 with eligible as materialized (
  select p.id,p.created_at,p.city,case p.city when 'la' then 'America/Los_Angeles' else 'America/New_York' end zone,
   m.completed_at,m.grandfathered from public.profiles p left join spotted_private.launch_members m on m.user_id=p.id
  where spotted_private.measurement_eligible(p.id)
 ), events as not materialized (
  select e.* from spotted_private.usage_events e join eligible p on p.id=e.user_id where e.created_at>=now()-interval '90 days'
 ), active as not materialized (
  select * from events where event in ('session_open','screen_view','plan_created','plan_response','plan_message','dm_sent','status_shared','venue_saved','friend_request','friendship_accepted','invite_sent','invite_responded','checkin_created','post_created','post_comment','post_like','group_created')
 ), pairs as materialized (
  select distinct least(f.user_id,f.friend_id) a,greatest(f.user_id,f.friend_id) b
  from public.friendships f join eligible p on p.id=f.user_id join eligible q on q.id=f.friend_id
  where f.status='accepted' and f.user_id<>f.friend_id and not exists(select 1 from public.blocked_users b where (b.blocker_id=f.user_id and b.blocked_id=f.friend_id) or (b.blocker_id=f.friend_id and b.blocked_id=f.user_id))
 ), edges as (select a,b from pairs union all select b,a from pairs), degrees as (
  select p.id,count(e.b) n from eligible p left join edges e on e.a=p.id where p.completed_at is not null group by p.id
 ), sessions as materialized (
  select s.* from spotted_private.app_sessions s join eligible p on p.id=s.user_id where s.started_at>=since
 ), cohorts as materialized (
  select p.*, (p.completed_at at time zone p.zone)::date cohort_date from eligible p
  where p.completed_at>=began and p.completed_at>=now()-interval '60 days' and not p.grandfathered
 ), retention as (
  select d.day,count(*) filter(where c.cohort_date+d.day<(now() at time zone c.zone)::date) eligible,
   count(*) filter(where c.cohort_date+d.day<(now() at time zone c.zone)::date and exists(select 1 from active a where a.user_id=c.id and (a.created_at at time zone c.zone)::date=c.cohort_date+d.day)) returned
  from (values(1),(7),(30)) d(day) left join cohorts c on true group by d.day
 ), firsts as (
  select p.id,p.created_at,p.completed_at,
   min(e.created_at) filter(where e.event='friendship_accepted' and e.created_at>=p.completed_at) first_friend,
   min(e.created_at) filter(where e.event='checkin_created' and e.created_at>=p.completed_at) first_checkin,
   min(e.created_at) filter(where e.event='dm_sent' and e.created_at>=p.completed_at) first_message,
   min(e.created_at) filter(where e.event in ('dm_sent','plan_message','post_comment') and e.created_at>=p.completed_at) first_social
  from eligible p left join events e on e.user_id=p.id where p.created_at>=since group by p.id,p.created_at,p.completed_at
 ), night_people as (
  select user_id,count(distinct night_date) nights,bool_or(event='checkin_created') checked from active where created_at>=since and mode='night' group by user_id
 ), network as (
  select surface,count(*) requests,count(*) filter(where outcome<>'ok') failures,
   round(100.0*count(*) filter(where outcome<>'ok')/nullif(count(*),0),1) error_percent,
   percentile_cont(0.95) within group(order by duration_ms) p95_ms
  from events where event='api_request' and created_at>=since group by surface
 ), ordered_map as (
  select a.user_id,a.session_id,a.created_at opened,m.at_time mapped,v.at_time selected,c.at_time checked from events a
  left join lateral(select min(e.created_at) at_time from events e where e.user_id=a.user_id and e.session_id=a.session_id and e.event='screen_view' and e.surface='map' and e.created_at>=a.created_at and e.created_at<a.created_at+interval '30 minutes') m on true
  left join lateral(select min(e.created_at) at_time from events e where e.user_id=a.user_id and e.session_id=a.session_id and e.event='venue_selected' and e.created_at>=m.at_time and e.created_at<a.created_at+interval '30 minutes') v on true
  left join lateral(select min(e.created_at) at_time from events e where e.user_id=a.user_id and e.event='checkin_created' and e.created_at>=v.at_time and e.created_at<a.created_at+interval '30 minutes') c on true
  where a.event='session_open' and a.session_id is not null and a.created_at>=since
 ), ordered_invites as (
  select g.id,g.claimed_by,g.claimed_at,p.completed_at,f.at_time friend_at,c.at_time checkin_at
  from spotted_private.launch_guests g left join eligible p on p.id=g.claimed_by
  left join lateral(select min(e.created_at) at_time from events e where e.user_id=p.id and e.event='friendship_accepted' and e.created_at>=p.completed_at and p.completed_at>=g.claimed_at) f on true
  left join lateral(select min(e.created_at) at_time from events e where e.user_id=p.id and e.event='checkin_created' and e.created_at>=f.at_time) c on true
  where g.revoked_at is null and g.invited_at>=greatest(since,began) and (g.claimed_by is null or p.id is not null)
  and (g.claimed_at is null or g.claimed_at>=g.invited_at)
 ), discovered as (
  select user_id,min(created_at) at_time from events where event='friend_discovered' and created_at>=since group by user_id
 ), ordered_friends as (
  select d.user_id,r.at_time requested,a.at_time accepted,i.at_time interacted from discovered d
  left join lateral(select e.created_at at_time,e.entity_id from events e where e.user_id=d.user_id and e.event='friend_request' and e.created_at>=d.at_time order by e.created_at limit 1) r on true
  left join lateral(select min(e.created_at) at_time from events e where e.user_id=d.user_id and e.event='friendship_accepted' and e.entity_id=r.entity_id and e.created_at>=r.at_time) a on true
  left join lateral(select min(e.created_at) at_time from events e where e.user_id=d.user_id and e.event in ('dm_sent','plan_message','post_comment') and e.created_at>=a.at_time and e.created_at<a.at_time+interval '7 days') i on true
 ), notification_journey as (
  select n.id,n.related_source_id,exists(select 1 from events e where e.user_id=n.user_id and e.entity_id=n.related_source_id and e.created_at>=n.created_at and e.created_at<n.created_at+interval '30 minutes'
   and ((n.notification_type='dm' and e.event='dm_sent') or (n.notification_type in ('plan_invite','plan_down','plan_comment') and e.event in ('plan_response','plan_message')) or e.event='invite_responded')) acted
  from events n where n.event='notification_opened' and n.entity_id is not null and n.created_at>=since
 ), referral as (
  select g.* from spotted_private.launch_guests g where g.revoked_at is null and g.nominated_by in(select id from eligible) and g.invited_at>=since
 )
 select jsonb_build_object(
  'started_at',(select command_center_started_at from spotted_private.launch_monitor_settings where id),
  'audience',jsonb_build_object('eligible_profiles',(select count(*) from eligible),'completed_profiles',(select count(*) from eligible where completed_at is not null),
   'excluded_profiles',(select count(*) from public.profiles)-(select count(*) from eligible)),
  'active',jsonb_build_object('dau',(select count(distinct user_id) from active where created_at>=now()-interval '24 hours'),
   'wau',(select count(distinct user_id) from active where created_at>=now()-interval '7 days'),'mau',(select count(distinct user_id) from active where created_at>=now()-interval '30 days'),
   'foreground_now',(select count(distinct s.user_id) from spotted_private.app_sessions s join eligible p on p.id=s.user_id where s.ended_at is null and s.last_seen_at>now()-interval '90 seconds'),
   'last_heartbeat',(select max(s.last_seen_at) from spotted_private.app_sessions s join eligible p on p.id=s.user_id),
   'foreground_sessions',(select count(*) from sessions),'observed_seconds',(select coalesce(round(avg(foreground_seconds)),0) from sessions)),
  'activation',jsonb_build_object('new_profiles',(select count(*) from firsts),'completed',(select count(*) from firsts where completed_at is not null),
   'onboarding_percent',(select round(100.0*count(*) filter(where completed_at is not null)/nullif(count(*),0),1) from firsts),
   'first_friend',(select count(*) from firsts where first_friend is not null),'first_checkin',(select count(*) from firsts where first_checkin is not null),
   'first_message',(select count(*) from firsts where first_message is not null),'first_social',(select count(*) from firsts where first_social is not null),
   'night_active',(select count(*) from night_people),'night_checkin_people',(select count(*) from night_people where checked),
   'night_checkin_percent',(select round(100.0*count(*) filter(where checked)/nullif(count(*),0),1) from night_people),
   'repeat_checkin_people',(select count(*) from(select user_id from events where event='checkin_created' and mode='night' and created_at>=since group by user_id having count(distinct night_date)>1) r)),
  'graph',jsonb_build_object('people',(select count(*) from degrees),'connections',(select count(*) from pairs),
   'average_friends',(select round(avg(n),1) from degrees),'zero_friends',(select count(*) from degrees where n=0),
   'three_plus',(select count(*) from degrees where n>=3),'three_plus_percent',(select round(100.0*count(*) filter(where n>=3)/nullif(count(*),0),1) from degrees),
   'connected_pairs_with_mutuals',(select count(*) from pairs p where exists(select 1 from edges e join edges f on f.b=e.b and f.a=p.b where e.a=p.a))),
  'retention',(select jsonb_agg(jsonb_build_object('day',day,'eligible',eligible,'returned',returned,'percent',round(100.0*returned/nullif(eligible,0),1)) order by day) from retention),
  'cohorts',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from(
   select cohort_date,count(*) completed,
    count(*) filter(where cohort_date+1<(now() at time zone zone)::date) d1_eligible,
    count(*) filter(where cohort_date+7<(now() at time zone zone)::date) d7_eligible,
    count(*) filter(where cohort_date+30<(now() at time zone zone)::date) d30_eligible,
    count(*) filter(where cohort_date+1<(now() at time zone zone)::date and exists(select 1 from active a where a.user_id=cohorts.id and (a.created_at at time zone zone)::date=cohort_date+1)) d1_returned,
    count(*) filter(where cohort_date+7<(now() at time zone zone)::date and exists(select 1 from active a where a.user_id=cohorts.id and (a.created_at at time zone zone)::date=cohort_date+7)) d7_returned,
    count(*) filter(where cohort_date+30<(now() at time zone zone)::date and exists(select 1 from active a where a.user_id=cohorts.id and (a.created_at at time zone zone)::date=cohort_date+30)) d30_returned
   from cohorts group by cohort_date order by cohort_date desc) c),
  'friction',jsonb_build_object('setup_over_24h',(select count(*) from eligible where completed_at is null and created_at<now()-interval '24 hours'),
   'repeated_errors',(select count(*) from(select user_id from events where created_at>=since and (event='action_failed' or(event='api_request' and outcome<>'ok')) group by user_id having count(*)>=3) r),
   'friend_discovery_no_request',(select count(distinct e.user_id) from events e where e.event='friend_discovered' and e.created_at>=since and e.created_at<now()-interval '30 minutes' and not exists(select 1 from events q where q.user_id=e.user_id and q.event='friend_request' and q.created_at>=e.created_at and q.created_at<e.created_at+interval '30 minutes'))),
  'map_funnel',jsonb_build_object('opened',(select count(*) from ordered_map),'map',(select count(*) from ordered_map where mapped is not null),'venue',(select count(*) from ordered_map where selected is not null),'checkin',(select count(*) from ordered_map where checked is not null)),
  'funnels',jsonb_build_object(
   'acquisition',jsonb_build_object('invited',(select count(*) from ordered_invites),'joined',(select count(*) from ordered_invites where claimed_at is not null),'onboarded',(select count(*) from ordered_invites where completed_at>=claimed_at),'friend',(select count(*) from ordered_invites where friend_at is not null),'checkin',(select count(*) from ordered_invites where checkin_at is not null)),
   'friendship',jsonb_build_object('discovered',(select count(*) from ordered_friends),'requested',(select count(*) from ordered_friends where requested is not null),'accepted',(select count(*) from ordered_friends where accepted is not null),'interaction',(select count(*) from ordered_friends where interacted is not null)),
   'notifications',jsonb_build_object('opened',(select count(*) from notification_journey),'linkable',(select count(*) from notification_journey where related_source_id is not null),'acted',(select count(*) from notification_journey where acted))),
  'network',(select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) from network n),
  'views',(select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) from(select surface,count(*) views,count(distinct user_id) people from events where event='screen_view' and created_at>=since group by surface) v),
  'groups_created',(select count(*) from events where event='group_created' and created_at>=since),
  'referrals',jsonb_build_object('invited',(select count(*) from referral),'claimed',(select count(*) from referral where claimed_by in(select id from eligible) and claimed_at>=invited_at),
   'claimed_per_member',(select round((select count(*) from referral where claimed_by in(select id from eligible) and claimed_at>=invited_at)::numeric/nullif(count(*),0),2) from eligible where completed_at is not null)),
  'waves',(select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) from(select w.name,count(g.id) selected,count(g.invited_at) invited,
   count(g.claimed_at) filter(where p.id is not null) claimed,count(p.completed_at) completed
   from spotted_private.launch_waves w left join spotted_private.launch_guests g on g.wave_id=w.id and g.revoked_at is null left join eligible p on p.id=g.claimed_by group by w.id,w.name order by w.name) w),
  'database',jsonb_build_object('connections',(select count(*) from pg_stat_activity where datname=current_database()),'max_connections',current_setting('max_connections')::integer),
  'email',jsonb_build_object('status','not_configured','destination','jane@joinspottedapp.com')
 ) into extra;
 return base||jsonb_build_object('command',extra);
end $$;
revoke all on function spotted_private.command_center(integer) from public,anon;
grant execute on function spotted_private.command_center(integer) to authenticated;
create function public.command_center(p_days integer default 7) returns jsonb language sql stable security invoker set search_path='' as $$select spotted_private.command_center(p_days);$$;
revoke all on function public.command_center(integer) from public,anon;
grant execute on function public.command_center(integer) to authenticated;
select cron.schedule('spotted-session-cleanup','41 6 * * *','delete from spotted_private.app_sessions where last_seen_at<now()-interval ''90 days''');
commit;
