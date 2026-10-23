begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create table spotted_private.command_samples(
 sampled_at timestamptz primary key default date_trunc('minute',now()),
 foreground_people integer not null, connections integer not null
);
alter table spotted_private.command_samples enable row level security;
revoke all on spotted_private.command_samples from public,anon,authenticated;
alter table spotted_private.launch_alerts drop constraint launch_alerts_alert_key_check;
alter table spotted_private.launch_alerts add constraint launch_alerts_alert_key_check check(alert_key in (
 'push_backlog','push_failures','push_terminal','push_disabled','client_errors','action_failures','sms_failures','push_job',
 'api_errors','api_slow','reset_job','database_capacity','activity_drop','email_worker','email_delivery'));
create table spotted_private.launch_email_settings(
 id boolean primary key default true check(id),enabled boolean not null default false,
 recipient text not null default 'jane@joinspottedapp.com',
 last_worker_at timestamptz,last_accepted_at timestamptz
);
insert into spotted_private.launch_email_settings(id) values(true);
alter table spotted_private.launch_email_settings enable row level security;
revoke all on spotted_private.launch_email_settings from public,anon,authenticated;
create table spotted_private.launch_email_outbox(
 alert_id uuid primary key references spotted_private.launch_alerts(id) on delete cascade,
 attempts integer not null default 0,available_at timestamptz not null default now(),
 lease_id uuid,lease_until timestamptz,accepted_at timestamptz,
 provider_id text,failed boolean not null default false
);
alter table spotted_private.launch_email_outbox enable row level security;
revoke all on spotted_private.launch_email_outbox from public,anon,authenticated;

create function spotted_private.sample_command_health() returns void
language plpgsql security definer set search_path='' set statement_timeout='8s' as $$
declare rule record; connections integer; current_people integer; previous_people integer;
begin
 if not pg_try_advisory_xact_lock(7314) then return;end if;
 select count(*) into connections from pg_stat_activity where datname=current_database();
 select count(distinct user_id) into current_people from spotted_private.app_sessions where ended_at is null and last_seen_at>now()-interval '90 seconds' and spotted_private.measurement_eligible(user_id);
 insert into spotted_private.command_samples(foreground_people,connections) values(current_people,connections) on conflict(sampled_at) do nothing;
 select max(foreground_people) into previous_people from spotted_private.command_samples where sampled_at between now()-interval '30 minutes' and now()-interval '15 minutes';
 for rule in
  select 'api_errors' k,'critical' s,count(*) filter(where outcome in ('network_error','server_error')) n,
   count(*)>=20 and count(*) filter(where outcome in ('network_error','server_error'))>=10 condition
   from spotted_private.usage_events where event='api_request' and created_at>now()-interval '5 minutes' and spotted_private.measurement_eligible(user_id)
  union all select 'api_slow','warning',count(*),count(*)>=20 and percentile_cont(.95) within group(order by duration_ms)>2000
   from spotted_private.usage_events where event='api_request' and created_at>now()-interval '5 minutes' and spotted_private.measurement_eligible(user_id)
  union all select 'reset_job','critical',count(*),count(*)>0 from (
   select j.jobid from cron.job j left join lateral(select status,start_time from cron.job_run_details where jobid=j.jobid order by start_time desc limit 1) r on true
   where j.jobname in ('nightly-reset-et-dst','nightly-reset-et','nightly-reset-pt-dst','nightly-reset-pt')
   and (not j.active or r.start_time is null or r.status='failed' or r.start_time<now()-interval '26 hours')
  ) x
  union all select 'database_capacity','critical',connections,connections>current_setting('max_connections')::integer*.8
  union all select 'activity_drop','warning',coalesce(previous_people,0)-current_people,previous_people>=20 and current_people<=2
  union all select 'email_delivery','critical',count(*),count(*)>0 from spotted_private.launch_email_outbox where failed
  union all select 'email_worker','critical',1,enabled and (last_worker_at is null or last_worker_at<now()-interval '5 minutes') from spotted_private.launch_email_settings where id
 loop
  if coalesce(rule.condition,false) then
   insert into spotted_private.launch_alerts(alert_key,severity,observed_count) values(rule.k,rule.s,greatest(rule.n,0))
   on conflict(alert_key) where resolved_at is null do update set observed_count=excluded.observed_count,last_seen_at=now();
  else update spotted_private.launch_alerts set resolved_at=now() where alert_key=rule.k and resolved_at is null;
  end if;
 end loop;
 -- One delivery per critical incident, independent of acknowledgments.
 insert into spotted_private.launch_email_outbox(alert_id)
 select id from spotted_private.launch_alerts where severity='critical' and resolved_at is null and alert_key not in ('email_worker','email_delivery')
 and (select enabled from spotted_private.launch_email_settings where id)
 on conflict(alert_id) do nothing;
 delete from spotted_private.command_samples where sampled_at<now()-interval '90 days';
end $$;
revoke all on function spotted_private.sample_command_health() from public,anon,authenticated;

create function spotted_private.claim_launch_alert_emails() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not (select enabled from spotted_private.launch_email_settings where id) then return '[]';end if;
 update spotted_private.launch_email_settings set last_worker_at=now() where id;
 with claim as (
  select o.alert_id from spotted_private.launch_email_outbox o join spotted_private.launch_alerts a on a.id=o.alert_id
  where o.accepted_at is null and not o.failed and a.resolved_at is null and o.available_at<=now()
   and (o.lease_until is null or o.lease_until<now()) order by o.available_at for update of o skip locked limit 5
 ), leased as (
  update spotted_private.launch_email_outbox o set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
  from claim c where o.alert_id=c.alert_id returning o.alert_id,o.lease_id
 ) select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'lease',l.lease_id,'key',a.alert_key,'count',a.observed_count,'opened_at',a.opened_at,
 'recipient',(select recipient from spotted_private.launch_email_settings where id))),'[]') into result from leased l join spotted_private.launch_alerts a on a.id=l.alert_id;
 return result;
end $$;
revoke all on function spotted_private.claim_launch_alert_emails() from public,anon,authenticated;
grant usage on schema spotted_private to service_role;
grant execute on function spotted_private.claim_launch_alert_emails() to service_role;
create function public.claim_launch_alert_emails() returns jsonb language sql security invoker set search_path='' as $$select spotted_private.claim_launch_alert_emails();$$;
revoke all on function public.claim_launch_alert_emails() from public,anon,authenticated;
grant execute on function public.claim_launch_alert_emails() to service_role;
create function spotted_private.finish_launch_alert_email(p_id uuid,p_lease uuid,p_provider_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_provider_id is not null and length(p_provider_id)>100 then raise exception 'Invalid receipt' using errcode='22023';end if;
 update spotted_private.launch_email_outbox set accepted_at=case when p_provider_id is not null then now() end,provider_id=p_provider_id,
  failed=p_provider_id is null and attempts>=8,available_at=now()+make_interval(secs=>least(3600,(power(2,least(attempts,8))*60)::integer)),lease_until=null,lease_id=null
 where alert_id=p_id and lease_id=p_lease and accepted_at is null;
 if found and p_provider_id is not null then update spotted_private.launch_email_settings set last_accepted_at=now() where id;end if;
end $$;
revoke all on function spotted_private.finish_launch_alert_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function spotted_private.finish_launch_alert_email(uuid,uuid,text) to service_role;
create function public.finish_launch_alert_email(p_id uuid,p_lease uuid,p_provider_id text) returns void language sql security invoker set search_path='' as $$select spotted_private.finish_launch_alert_email(p_id,p_lease,p_provider_id);$$;
revoke all on function public.finish_launch_alert_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finish_launch_alert_email(uuid,uuid,text) to service_role;

create function spotted_private.dispatch_launch_alert_emails() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not (select enabled from spotted_private.launch_email_settings where id) then return;end if;
 perform net.http_post(url:='https://rwavbyvdytdegntdryll.supabase.co/functions/v1/launch-alert-email',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='spotted_push_service_key')),
  body:='{}'::jsonb,timeout_milliseconds:=10000);
end $$;
revoke all on function spotted_private.dispatch_launch_alert_emails() from public,anon,authenticated;

alter function spotted_private.command_center(integer) rename to command_center_metrics;
revoke all on function spotted_private.command_center_metrics(integer) from public,anon,authenticated;
create function spotted_private.command_center(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='8s' as $$
declare result jsonb; extra jsonb;
begin
 result:=spotted_private.command_center_metrics(p_days);
 select jsonb_build_object('peak_sampled_foreground',max(foreground_people),'last_sample_at',max(sampled_at)) into extra
 from spotted_private.command_samples where sampled_at>=(result->>'since')::timestamptz;
 result:=jsonb_set(result,'{command,operations}',extra);
 result:=jsonb_set(result,'{command,email}',(select jsonb_build_object('status',case when not enabled then 'not_configured' when exists(select 1 from spotted_private.launch_email_outbox where failed) then 'delivery_failed' when last_accepted_at is null then 'awaiting_delivery_test' when last_worker_at<now()-interval '5 minutes' then 'stale' else 'connected' end,
  'destination',recipient,'last_worker_at',last_worker_at,'last_accepted_at',last_accepted_at,'failed',(select count(*) from spotted_private.launch_email_outbox where failed)) from spotted_private.launch_email_settings where id));
 return result;
end $$;
revoke all on function spotted_private.command_center(integer) from public,anon;
grant execute on function spotted_private.command_center(integer) to authenticated;
select cron.schedule('spotted-command-health','* * * * *','select spotted_private.sample_command_health()');
select cron.schedule('spotted-launch-email','* * * * *','select spotted_private.dispatch_launch_alert_emails()');
commit;
