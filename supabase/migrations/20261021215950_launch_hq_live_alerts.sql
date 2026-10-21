-- Additive extension of the existing founder-only Launch HQ.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create function spotted_private.is_launch_monitor() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from spotted_private.launch_operators
 where user_id=auth.uid() and wave_admin and founder_monitor);
$$;
revoke all on function spotted_private.is_launch_monitor() from public,anon;
grant execute on function spotted_private.is_launch_monitor() to authenticated;

-- Realtime only sends invalidation, never product rows or statistics.
create table public.launch_monitor_signal(id boolean primary key default true check(id),changed_at timestamptz not null default now());
alter table public.launch_monitor_signal enable row level security;
revoke all on public.launch_monitor_signal from public,anon,authenticated;
grant select on public.launch_monitor_signal to authenticated;
create policy founder_signal on public.launch_monitor_signal for select to authenticated using((select spotted_private.is_launch_monitor()));
insert into public.launch_monitor_signal values(true,now());
create function spotted_private.signal_launch_monitor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not pg_try_advisory_xact_lock(725044) then return null; end if;
 update public.launch_monitor_signal set changed_at=clock_timestamp() where id and changed_at<clock_timestamp()-interval '3 seconds';
 return null;
exception when others then return null; -- analytics must not block a product action
end $$;
revoke all on function spotted_private.signal_launch_monitor() from public,anon,authenticated;
create trigger monitor_usage_signal after insert on spotted_private.usage_events for each statement execute function spotted_private.signal_launch_monitor();
create trigger monitor_invite_signal after insert or update or delete on spotted_private.launch_guests for each statement execute function spotted_private.signal_launch_monitor();
create trigger monitor_member_signal after insert or update on spotted_private.launch_members for each statement execute function spotted_private.signal_launch_monitor();
create trigger monitor_push_signal after insert on public.push_logs for each statement execute function spotted_private.signal_launch_monitor();
create trigger monitor_queue_signal after insert or update or delete on public.push_outbox for each statement execute function spotted_private.signal_launch_monitor();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.launch_monitor_signal;
 end if;
end $$;

-- Strict fixed vocabulary: no messages, stack traces, URLs, coordinates or arbitrary metadata.
create table spotted_private.client_health_events(
 id uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('heartbeat','render_error','unhandled_error','unhandled_rejection','native_crash')),
 platform text not null check(platform in ('web','ios','android')),
 source text not null check(source in ('client','trusted_native')),
 created_at timestamptz not null default now()
);
alter table spotted_private.client_health_events enable row level security;
revoke all on spotted_private.client_health_events from public,anon,authenticated;
create index client_health_time on spotted_private.client_health_events(created_at,kind);
create index client_health_user_time on spotted_private.client_health_events(user_id,created_at desc);
create trigger monitor_crash_signal after insert on spotted_private.client_health_events for each statement execute function spotted_private.signal_launch_monitor();

create function spotted_private.record_client_health(p_id uuid,p_kind text,p_platform text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_id is null or p_kind is null or p_platform is null or p_kind not in ('heartbeat','render_error','unhandled_error','unhandled_rejection') or p_platform not in ('web','ios','android') then
  raise exception 'Unsupported health event' using errcode='22023';
 end if;
 if not exists(select 1 from public.profiles p where p.id=u and not coalesce(p.is_demo,false))
 or exists(select 1 from spotted_private.usage_exclusions where user_id=u)
 or exists(select 1 from spotted_private.night_mode_testers where user_id=u) then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,7241));
 if exists(select 1 from spotted_private.client_health_events where id=p_id) then return; end if;
 if p_kind='heartbeat' and exists(select 1 from spotted_private.client_health_events where user_id=u and kind='heartbeat' and created_at>now()-interval '5 minutes') then return; end if;
 if (select count(*) from spotted_private.client_health_events where user_id=u and kind<>'heartbeat' and created_at>now()-interval '1 minute')>=10 then return; end if;
 insert into spotted_private.client_health_events(id,user_id,kind,platform,source) values(p_id,u,p_kind,p_platform,'client');
end $$;
revoke all on function spotted_private.record_client_health(uuid,text,text) from public,anon;
grant execute on function spotted_private.record_client_health(uuid,text,text) to authenticated;
create function public.record_client_health(p_id uuid,p_kind text,p_platform text) returns void language sql security invoker set search_path='' as $$ select spotted_private.record_client_health(p_id,p_kind,p_platform); $$;
revoke all on function public.record_client_health(uuid,text,text) from public,anon;
grant execute on function public.record_client_health(uuid,text,text) to authenticated;

create table spotted_private.launch_alerts(
 id uuid primary key default gen_random_uuid(),
 alert_key text not null check(alert_key in ('push_backlog','push_failures','push_terminal','push_disabled','client_errors','action_failures','sms_failures','push_job')),
 severity text not null check(severity in ('warning','critical')),
 observed_count bigint not null,
 opened_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 resolved_at timestamptz, acknowledged_at timestamptz, acknowledged_by uuid references auth.users(id) on delete set null
);
create unique index launch_alert_open_key on spotted_private.launch_alerts(alert_key) where resolved_at is null;
create index launch_alert_recent on spotted_private.launch_alerts(opened_at desc);
alter table spotted_private.launch_alerts enable row level security;
revoke all on spotted_private.launch_alerts from public,anon,authenticated;
create trigger monitor_alert_signal after insert or update on spotted_private.launch_alerts for each statement execute function spotted_private.signal_launch_monitor();
create table spotted_private.launch_alert_runner(id boolean primary key default true check(id),last_evaluated_at timestamptz);
alter table spotted_private.launch_alert_runner enable row level security;
revoke all on spotted_private.launch_alert_runner from public,anon,authenticated;
insert into spotted_private.launch_alert_runner(id) values(true);
create index if not exists push_logs_monitor_time on public.push_logs(created_at);

-- Runs as the scheduler owner, never callable by clients. No outbound messaging.
create function spotted_private.evaluate_launch_alerts() returns void language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare rule record; job_problem bigint:=0;
begin
 if not pg_try_advisory_xact_lock(725041) then return; end if;
 select case when not exists(select 1 from cron.job where jobname='spotted-push-delivery' and active) then 1
 when not exists(select 1 from cron.job j join cron.job_run_details r on r.jobid=j.jobid where j.jobname='spotted-push-delivery' and r.start_time>now()-interval '5 minutes' and r.status in ('succeeded','running')) then 1 else 0 end into job_problem;
 for rule in
  select 'push_backlog' k,'critical' s,count(*) n,1 threshold from public.push_outbox where
   (state='pending' and available_at<now()-interval '5 minutes') or (state='sending' and lease_until<now()-interval '5 minutes')
  union all select 'push_failures','warning',count(*),3 from public.push_logs where created_at>=now()-interval '15 minutes' and success is false and coalesce(error,'') not in ('privacy_or_expiry','receiver_not_found','push_not_enabled')
  union all select 'push_terminal','critical',count(*),1 from public.push_outbox where state='failed'
  union all select 'push_disabled','critical',count(*),1 from public.push_outbox where state in ('pending','sending') and not coalesce((select delivery_enabled from spotted_private.push_settings),false)
  union all select 'client_errors','critical',count(*),1 from spotted_private.client_health_events h join public.profiles p on p.id=h.user_id where h.kind<>'heartbeat' and h.created_at>=now()-interval '15 minutes' and not coalesce(p.is_demo,false) and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=h.user_id) and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=h.user_id)
  union all select 'action_failures','warning',count(*),5 from spotted_private.measured_usage where event='action_failed' and created_at>=now()-interval '15 minutes'
  union all select 'sms_failures','warning',count(*),1 from spotted_private.launch_messages where status in ('failed','undelivered') and updated_at>=now()-interval '15 minutes'
  union all select 'push_job','critical',job_problem,1 where exists(select 1 from public.push_outbox where state in ('pending','sending'))
 loop
  if rule.n>=rule.threshold then
   insert into spotted_private.launch_alerts(alert_key,severity,observed_count) values(rule.k,rule.s,rule.n)
   on conflict(alert_key) where resolved_at is null do update set observed_count=excluded.observed_count,last_seen_at=now();
  else
   update spotted_private.launch_alerts set resolved_at=now() where alert_key=rule.k and resolved_at is null;
  end if;
 end loop;
 -- No queued work makes the queue-worker condition non-actionable.
 if not exists(select 1 from public.push_outbox where state in ('pending','sending')) then
  update spotted_private.launch_alerts set resolved_at=now() where alert_key='push_job' and resolved_at is null;
 end if;
 update spotted_private.launch_alert_runner set last_evaluated_at=now() where id;
 delete from spotted_private.client_health_events where created_at<now()-interval '30 days';
 delete from spotted_private.launch_alerts where resolved_at<now()-interval '90 days';
end $$;
revoke all on function spotted_private.evaluate_launch_alerts() from public,anon,authenticated;

create function spotted_private.acknowledge_launch_alert(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not spotted_private.is_launch_monitor() then raise exception 'Founder monitoring access required' using errcode='42501';end if;
 update spotted_private.launch_alerts set acknowledged_at=now(),acknowledged_by=auth.uid() where id=p_id and resolved_at is null and acknowledged_at is null;
end $$;
revoke all on function spotted_private.acknowledge_launch_alert(uuid) from public,anon;
grant execute on function spotted_private.acknowledge_launch_alert(uuid) to authenticated;
create function public.acknowledge_launch_alert(p_id uuid) returns void language sql security invoker set search_path='' as $$select spotted_private.acknowledge_launch_alert(p_id);$$;
revoke all on function public.acknowledge_launch_alert(uuid) from public,anon;
grant execute on function public.acknowledge_launch_alert(uuid) to authenticated;

-- v1 remains compatible; v2 adds only aggregates and sanitized incident records.
create function spotted_private.launch_monitor_live(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare base jsonb; extra jsonb; since timestamptz;
begin
 base:=spotted_private.launch_monitor(p_days); -- same current-database founder gate
 since:=(base->>'since')::timestamptz;
 with cohort as materialized (
  select g.invited_at,g.claimed_at,m.completed_at from spotted_private.launch_guests g left join spotted_private.launch_members m on m.user_id=g.claimed_by
  where g.revoked_at is null and g.invited_at>=since and g.invited_at<=now()
 ), health as materialized (
  select h.* from spotted_private.client_health_events h join public.profiles p on p.id=h.user_id
  where h.created_at>=since and not coalesce(p.is_demo,false)
   and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=h.user_id)
   and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=h.user_id)
 ), recent as materialized (
  select * from spotted_private.measured_usage where created_at>=now()-interval '15 minutes'
 )
 select jsonb_build_object(
  'live',jsonb_build_object('active_15m',(select count(distinct user_id) from recent where event in ('session_open','plan_created','plan_response','plan_message','dm_sent','status_shared','venue_saved','friend_request','friendship_accepted','invite_sent','invite_responded','checkin_created','post_created','post_comment','post_like')),
   'checkins_15m',(select count(*) from recent where event='checkin_created'),'events_15m',(select count(*) from recent)),
  'conversion',jsonb_build_object('invited',(select count(*) from cohort),'claimed',(select count(*) from cohort where claimed_at>=invited_at),
   'completed',(select count(*) from cohort where claimed_at>=invited_at and completed_at>=claimed_at),
   'claim_percent',(select round(100.0*count(*) filter(where claimed_at>=invited_at)/nullif(count(*),0),1) from cohort),
   'completion_percent',(select round(100.0*count(*) filter(where claimed_at>=invited_at and completed_at>=claimed_at)/nullif(count(*),0),1) from cohort)),
  'client_health',jsonb_build_object('reports',(select count(*) from health where kind<>'heartbeat'),
   'affected_people',(select count(distinct user_id) from health where kind<>'heartbeat'),
   'reporting_people',(select count(distinct user_id) from health where kind='heartbeat'),
   'last_report_at',(select max(created_at) from health where kind<>'heartbeat'),
   'last_heartbeat_at',(select max(created_at) from health where kind='heartbeat'),
   'native_status',case when exists(select 1 from health where source='trusted_native') then 'receiving' else 'not_connected' end,
   'groups',(select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from (select platform,kind,count(*) reports from health where kind<>'heartbeat' group by platform,kind order by platform,kind) g)),
  'alerts_evaluated_at',(select last_evaluated_at from spotted_private.launch_alert_runner where id),
  'alerts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.opened_at desc),'[]'::jsonb) from (
   select id,alert_key,severity,observed_count,opened_at,last_seen_at,resolved_at,acknowledged_at from spotted_private.launch_alerts
   where resolved_at is null or resolved_at>=now()-interval '24 hours' order by opened_at desc limit 100) a)
 ) into extra;
 return base||extra;
end $$;
revoke all on function spotted_private.launch_monitor_live(integer) from public,anon;
grant execute on function spotted_private.launch_monitor_live(integer) to authenticated;
create function public.launch_monitor_live(p_days integer default 7) returns jsonb language sql stable security invoker set search_path='' as $$select spotted_private.launch_monitor_live(p_days);$$;
revoke all on function public.launch_monitor_live(integer) from public,anon;
grant execute on function public.launch_monitor_live(integer) to authenticated;
-- Must exist in this production project; fail atomically if the scheduler is unavailable.
select cron.schedule('spotted-launch-alerts','* * * * *','select spotted_private.evaluate_launch_alerts()');
commit;
