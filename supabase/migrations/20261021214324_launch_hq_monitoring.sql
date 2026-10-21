-- Requires the approved_ux_and_retention_build63 backend migration, already live.
-- Extends the existing Launch HQ and event ledger; never exposes raw event rows.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Deliberately separate from delegated wave operations. Bootstrap only the
-- existing single founder; future wave admins do not inherit monitoring access.
alter table spotted_private.launch_operators add column founder_monitor boolean not null default false;
do $$ begin
 if (select count(*) from spotted_private.launch_operators where wave_admin) <> 1 then
  raise exception 'Expected exactly one existing founder; assign monitoring access explicitly';
 end if;
 update spotted_private.launch_operators set founder_monitor=true where wave_admin;
end $$;

create table spotted_private.launch_monitor_settings (
 id boolean primary key default true check(id),
 extended_events_started_at timestamptz not null default now()
);
alter table spotted_private.launch_monitor_settings enable row level security;
revoke all on spotted_private.launch_monitor_settings from public,anon,authenticated;
insert into spotted_private.launch_monitor_settings(id) values(true);

alter table spotted_private.usage_events drop constraint usage_events_event_check;
alter table spotted_private.usage_events add constraint usage_events_event_check check(event in (
 'session_open','plan_started','action_failed','notification_opened','plan_created','plan_response','plan_message',
 'venue_saved','dm_sent','status_shared','notification_optout','onboarding_complete','friend_request',
 'friendship_accepted','invite_sent','invite_responded','checkin_created','post_created','post_comment','post_like'
));

create function spotted_private.record_launch_monitor_action() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Existing recorder applies demo/test exclusions and onboarding eligibility.
 -- No venue, GPS, text, contact, or entity identifier is copied into these events.
 if tg_table_name='checkins' then
  if not coalesce(new.is_demo,false) then perform spotted_private.record_usage(new.user_id,'checkin_created'); end if;
 elsif tg_table_name='posts' then
  if not coalesce(new.is_demo,false) then perform spotted_private.record_usage(new.user_id,'post_created'); end if;
 elsif tg_table_name='post_comments' then
  perform spotted_private.record_usage(new.user_id,'post_comment');
 elsif tg_table_name='post_likes' then
  perform spotted_private.record_usage(new.user_id,'post_like');
 end if;
 return new;
exception when others then
 -- Measurement must never abort the user's product action. Do not log SQLERRM.
 raise warning 'launch_monitor_capture_failed: %',sqlstate;
 return new;
end $$;
revoke all on function spotted_private.record_launch_monitor_action() from public,anon,authenticated;
create trigger launch_monitor_checkin after insert on public.checkins for each row execute function spotted_private.record_launch_monitor_action();
create trigger launch_monitor_post after insert on public.posts for each row execute function spotted_private.record_launch_monitor_action();
create trigger launch_monitor_comment after insert on public.post_comments for each row execute function spotted_private.record_launch_monitor_action();
create trigger launch_monitor_like after insert on public.post_likes for each row execute function spotted_private.record_launch_monitor_action();

create function spotted_private.launch_monitor(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare
 days integer := greatest(1,least(coalesce(p_days,7),30));
 since timestamptz;
 result jsonb;
 jobs jsonb := null;
 active_events text[] := array['session_open','plan_created','plan_response','plan_message','dm_sent','status_shared',
 'venue_saved','friend_request','friendship_accepted','invite_sent','invite_responded','checkin_created','post_created','post_comment','post_like'];
begin
 if auth.uid() is null or not exists(select 1 from spotted_private.launch_operators where user_id=auth.uid() and wave_admin and founder_monitor) then
  raise exception 'Founder monitoring access required' using errcode='42501';
 end if;
 since := now()-make_interval(days=>days);
 -- Whitelisted job names/statuses only. Never expose commands, credentials or errors.
 begin
  select coalesce(jsonb_agg(jsonb_build_object('name',j.jobname,'enabled',j.active,
   'last_run',r.start_time,'last_finished',r.end_time,
   'status',case when r.status in ('succeeded','running','failed') then r.status else 'unknown' end) order by j.jobname),'[]'::jsonb)
  into jobs from cron.job j left join lateral (
   select start_time,end_time,status from cron.job_run_details where jobid=j.jobid order by runid desc limit 1
  ) r on true where j.jobname in ('spotted-push-delivery','spotted-usage-cleanup',
   'nightly-reset-et-dst','nightly-reset-et','nightly-reset-pt-dst','nightly-reset-pt');
 exception when undefined_table or invalid_schema_name or insufficient_privilege then jobs:=null;
 end;
 with eligible as materialized (
  select p.id,p.created_at,p.city from public.profiles p
  where not coalesce(p.is_demo,false) and p.city in ('nyc','la')
  and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=p.id)
  and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=p.id)
 ), usage as materialized (
  select e.* from spotted_private.measured_usage e where e.created_at>=since
 ), cities(city,zone) as (values ('nyc','America/New_York'),('la','America/Los_Angeles')),
 nights as (
  select c.city,(((now() at time zone c.zone)-interval '5 hours')::date-d.n) night_date
  from cities c cross join generate_series(0,days-1) d(n)
 ), nightly as (
  select n.city,n.night_date,count(distinct e.user_id) filter(where e.event=any(active_events)) active_users,
   count(distinct e.user_id) filter(where e.event='session_open') app_openers,
   count(*) filter(where e.event='checkin_created') checkins,
   count(*) filter(where e.event='post_created') posts
  from nights n left join usage e on e.city=n.city and e.night_date=n.night_date group by n.city,n.night_date
 ), push as materialized (
  select success,error from public.push_logs where created_at>=since
 )
 select jsonb_build_object(
 'generated_at',now(),'since',since,'days',days,
 'coverage',jsonb_build_object(
  'usage_started_at',(select started_at from spotted_private.retention_measurement_settings where id),
  'extended_events_started_at',(select extended_events_started_at from spotted_private.launch_monitor_settings where id),
  'last_event_at',(select max(created_at) from spotted_private.measured_usage),
  'last_session_at',(select max(created_at) from spotted_private.measured_usage where event='session_open'),
  'native_crashes','not_instrumented'),
 'invites',jsonb_build_object(
  'selected',(select count(*) from spotted_private.launch_guests where revoked_at is null),
  'invited',(select count(*) from spotted_private.launch_guests where invited_at is not null and revoked_at is null),
  'claimed',(select count(*) from spotted_private.launch_guests where claimed_at is not null and revoked_at is null),
  'joined',(select count(*) from spotted_private.launch_guests g join spotted_private.launch_members m on m.user_id=g.claimed_by where m.completed_at is not null and g.revoked_at is null),
  'sms_failed',(select count(*) from spotted_private.launch_messages where status in ('failed','undelivered') and updated_at>=since)),
 'onboarding',jsonb_build_object(
  'signups',(select count(*) from eligible where created_at>=since),
  'admitted',(select count(*) from eligible p join spotted_private.launch_members m on m.user_id=p.id where m.admitted_at>=since),
  'completed',(select count(*) from eligible p join spotted_private.launch_members m on m.user_id=p.id where m.completed_at>=since and not m.grandfathered),
  'incomplete',(select count(*) from eligible p join spotted_private.launch_members m on m.user_id=p.id where m.completed_at is null),
  'grandfathered',(select count(*) from eligible p join spotted_private.launch_members m on m.user_id=p.id where m.grandfathered)),
 'activity',jsonb_build_object(
  'active_users',(select count(distinct user_id) from usage where event=any(active_events)),
  'app_openers',(select count(distinct user_id) from usage where event='session_open'),
  'checkins',(select count(*) from usage where event='checkin_created'),
  'posts',(select count(*) from usage where event='post_created')),
 'nightly',(select coalesce(jsonb_agg(to_jsonb(n) order by night_date desc,city),'[]'::jsonb) from nightly n),
 'social',(select coalesce(jsonb_agg(to_jsonb(s) order by event),'[]'::jsonb) from (
  select event,count(*) events,count(distinct user_id) people from usage
  where event=any(active_events) and event not in ('session_open','checkin_created') group by event) s),
 'failures',(select coalesce(jsonb_agg(to_jsonb(f) order by feature),'[]'::jsonb) from (
  select coalesce(feature,'other') feature,count(*) events from usage where event='action_failed' group by feature) f),
 'push',jsonb_build_object(
  'accepted',(select count(*) from push where success is true),
  'failed_attempts',(select count(*) from push where success is false and coalesce(error,'') not in ('privacy_or_expiry','receiver_not_found','push_not_enabled')),
  'skipped',(select count(*) from push where success is false and error in ('privacy_or_expiry','receiver_not_found','push_not_enabled')),
  'unknown',(select count(*) from push where success is null),
  'last_attempt_at',(select max(created_at) from public.push_logs),
  'pending',(select count(*) from public.push_outbox where state in ('pending','sending')),
  'overdue',(select count(*) from public.push_outbox where (state='pending' and available_at<now()-interval '5 minutes') or (state='sending' and lease_until<now()-interval '5 minutes')),
  'terminal_failed',(select count(*) from public.push_outbox where state='failed'),
  'delivery_enabled',(select delivery_enabled from spotted_private.push_settings),
  'campaigns_enabled',(select campaigns_enabled from spotted_private.push_settings)),
 'health',jsonb_build_object('database','reachable','jobs',jobs)
 ) into result;
 return result;
end $$;
revoke all on function spotted_private.launch_monitor(integer) from public,anon,authenticated;
grant usage on schema spotted_private to authenticated;
grant execute on function spotted_private.launch_monitor(integer) to authenticated;
create function public.launch_monitor(p_days integer default 7) returns jsonb
language sql stable security invoker set search_path='' as $$ select spotted_private.launch_monitor(p_days); $$;
revoke all on function public.launch_monitor(integer) from public,anon;
grant execute on function public.launch_monitor(integer) to authenticated;
commit;
