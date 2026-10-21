// Run with PGLITE_MODULE pointing to a pinned @electric-sql/pglite installation.
// Baseline fixture models the deployed build-63 schema; no production data used.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const founder='00000000-0000-0000-0000-000000000001', member='00000000-0000-0000-0000-000000000002', demo='00000000-0000-0000-0000-000000000003', delegated='00000000-0000-0000-0000-000000000004';
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema spotted_private; create schema auth; create schema cron;
 grant usage on schema public,auth to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.profiles(id uuid primary key,city text,is_demo boolean default false,created_at timestamptz default now());
 create table spotted_private.launch_operators(user_id uuid primary key,wave_admin boolean default false,city_tester boolean default false);
 insert into spotted_private.launch_operators(user_id,wave_admin) values('${founder}',true);
 create table spotted_private.launch_members(user_id uuid primary key,admitted_at timestamptz default now(),completed_at timestamptz,grandfathered boolean default false);
 create table spotted_private.usage_exclusions(user_id uuid primary key);
 create table spotted_private.night_mode_testers(user_id uuid primary key);
 create table spotted_private.usage_events(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles(id) on delete cascade,event text constraint usage_events_event_check check(event in ('session_open')),feature text,entity_id uuid,mode text,city text,night_date date,created_at timestamptz default now());
 alter table spotted_private.usage_events enable row level security;
 create view spotted_private.measured_usage with(security_invoker=true) as select e.* from spotted_private.usage_events e join public.profiles p on p.id=e.user_id where not coalesce(p.is_demo,false) and not exists(select 1 from spotted_private.usage_exclusions x where x.user_id=e.user_id) and not exists(select 1 from spotted_private.night_mode_testers t where t.user_id=e.user_id);
 create table spotted_private.retention_measurement_settings(id boolean primary key,started_at timestamptz default now());
 insert into spotted_private.retention_measurement_settings(id) values(true);
 create table spotted_private.launch_guests(id uuid primary key,revoked_at timestamptz,invited_at timestamptz,claimed_at timestamptz,claimed_by uuid);
 create table spotted_private.launch_messages(status text,updated_at timestamptz);
 create table public.push_logs(success boolean,error text,created_at timestamptz default now());
 create table public.push_outbox(state text,available_at timestamptz,lease_until timestamptz);
 create table spotted_private.push_settings(delivery_enabled boolean,campaigns_enabled boolean);
 insert into spotted_private.push_settings values(true,false);
 create table cron.job(jobid bigint primary key,jobname text,active boolean);
 create table cron.job_run_details(jobid bigint,runid bigint,start_time timestamptz,end_time timestamptz,status text);
 create table public.checkins(id uuid default gen_random_uuid(),user_id uuid,is_demo boolean default false,lat float,lng float);
 create table public.posts(id uuid default gen_random_uuid(),user_id uuid,is_demo boolean default false,content text);
 create table public.post_comments(id uuid default gen_random_uuid(),user_id uuid,content text);
 create table public.post_likes(id uuid default gen_random_uuid(),user_id uuid);
 create function public.is_night_mode(text) returns boolean language sql as $$ select true $$;
 create function spotted_private.record_usage(p_user uuid,p_event text,p_feature text default null,p_entity uuid default null) returns void language plpgsql security definer set search_path='' as $$
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
 revoke all on function spotted_private.record_usage(uuid,text,text,uuid) from public,anon,authenticated;
`);
await db.exec(await readFile(new URL('../migrations/20261021214324_launch_hq_monitoring.sql',import.meta.url),'utf8'));
await db.exec(`insert into public.profiles(id,city,is_demo) values('${founder}','nyc',false),('${member}','nyc',false),('${demo}','nyc',true),('${delegated}','la',false);
 insert into spotted_private.launch_members(user_id,completed_at) select id,now() from public.profiles;
 insert into spotted_private.launch_operators(user_id,wave_admin) values('${delegated}',true);
 insert into public.checkins(user_id,lat,lng) values('${member}',40.123,-73.123),('${demo}',40.123,-73.123);
 insert into public.posts(user_id,content) values('${member}','NEVER EXPOSE THIS');
 insert into public.post_comments(user_id,content) values('${member}','PRIVATE COMMENT');
 insert into public.post_likes(user_id) values('${member}');
 insert into public.push_logs(success,error) values(true,null),(false,'privacy_or_expiry'),(false,'provider failure (500)'),(null,null);
 insert into public.push_outbox values('pending',now()-interval '6 minutes',null),('sending',now(),now()-interval '6 minutes'),('failed',now(),null);
 insert into cron.job values(1,'spotted-push-delivery',true),(2,'private-job-with-secret',true);
 insert into cron.job_run_details values(1,1,now(),now(),'succeeded');
`);
const q=async sql=>(await db.query(sql)).rows;
assert.equal((await q('select count(*)::int n from spotted_private.usage_events'))[0].n,4,'All four events recorded; demo excluded');
assert.equal((await q('select count(*)::int n from spotted_private.usage_events where entity_id is not null'))[0].n,0,'No content or entity copied');
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${member}',false);`);
await assert.rejects(db.query('select public.launch_monitor(7)'),/Founder monitoring access/);
await assert.rejects(db.query('select * from spotted_private.usage_events'),/permission denied/);
await assert.rejects(db.query('update spotted_private.launch_operators set founder_monitor=true'),/permission denied/);
await db.exec(`select set_config('request.jwt.claim.sub','${delegated}',false)`);
await assert.rejects(db.query('select public.launch_monitor(7)'),/Founder monitoring access/);
await db.exec(`select set_config('request.jwt.claim.sub','${founder}',false)`);
const report=(await q('select public.launch_monitor(7) report'))[0].report;
assert.equal(report.activity.active_users,1); assert.equal(report.activity.checkins,1); assert.equal(report.activity.posts,1);
assert.equal(report.nightly.length,14); assert.equal(report.push.failed_attempts,1); assert.equal(report.push.skipped,1);
assert.equal(report.push.overdue,2); assert.equal(report.push.unknown,1); assert.equal(report.health.jobs.length,1);
assert.equal((await q('select public.launch_monitor(999) report'))[0].report.days,30);
assert.equal((await q('select public.launch_monitor(-1) report'))[0].report.days,1);
assert.equal((await q('select public.launch_monitor(null) report'))[0].report.days,7);
const serialized=JSON.stringify(report);
for(const forbidden of [member,demo,'NEVER EXPOSE','PRIVATE COMMENT','40.123','-73.123','private-job-with-secret','provider failure']) assert.ok(!serialized.includes(forbidden),forbidden);
await db.exec(`reset role; update spotted_private.launch_operators set founder_monitor=false where user_id='${founder}'; set role authenticated;`);
await assert.rejects(db.query('select public.launch_monitor(7)'),/Founder monitoring access/);
await db.exec('reset role; set role anon');
await assert.rejects(db.query('select public.launch_monitor(7)'),/permission denied/);
await db.exec(`reset role; insert into spotted_private.usage_exclusions values('${member}'); update spotted_private.launch_operators set founder_monitor=true where user_id='${founder}'; set role authenticated;`);
assert.equal((await q('select public.launch_monitor(7) report'))[0].report.activity.active_users,0,'Read-time exclusion removes historical usage');
await db.exec(`reset role; create or replace function spotted_private.record_usage(p_user uuid,p_event text,p_feature text default null,p_entity uuid default null) returns void language plpgsql as $$ begin raise exception 'simulated recorder outage'; end $$;
 insert into public.checkins(user_id) values('${member}');`);
assert.equal((await q('select count(*)::int n from public.checkins'))[0].n,3,'Capture failure does not block product insert');
// Daylight-saving transition still assigns local 4:59 AM to the previous night.
const boundary=await q(`select (('2026-11-01T09:59:00Z'::timestamptz at time zone 'America/New_York')-interval '5 hours')::date::text d`);
assert.equal(boundary[0].d,'2026-10-31');
console.log('PASS: event capture, exclusions, auth/anon/delegated/revoked access, direct-table denial, privacy, bounded periods, push categories, job allowlist, DST and non-blocking failures.');
const { testLiveMonitoring } = await import('./launch-hq-live.test.mjs');
await testLiveMonitoring(db,{founder,member,demo,delegated});
const {testCommandCenter}=await import('./command-center.test.mjs');
await testCommandCenter(db,{founder,member,demo,delegated});
await db.close();
