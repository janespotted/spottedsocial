import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function testCommandCenter(db,{founder,member,demo,delegated}) {
 const q=async sql=>(await db.query(sql)).rows;
 await db.exec(`reset role;delete from spotted_private.usage_exclusions;
 update spotted_private.launch_operators set founder_monitor=true where user_id='${founder}';
 alter table spotted_private.usage_events add column notification_type text,add column related_source_id uuid;
 create table public.friendships(user_id uuid,friend_id uuid,status text);
 create table public.blocked_users(blocker_id uuid,blocked_id uuid);
 create table public.dm_threads(id uuid default gen_random_uuid(),created_by uuid,is_group boolean);
 create table spotted_private.launch_waves(id uuid primary key,name text);
 alter table spotted_private.launch_guests add column nominated_by uuid,add column wave_id uuid;
 create function public.is_night_mode(text,timestamptz) returns boolean language sql as $$ select true $$;
 create or replace function spotted_private.record_usage(p_user uuid,p_event text,p_feature text default null,p_entity uuid default null) returns void language plpgsql security definer set search_path='' as $$
 begin
  if not spotted_private.measurement_eligible(p_user) then return;end if;
  insert into spotted_private.usage_events(user_id,event,feature,entity_id,mode,city,night_date) values(p_user,p_event,p_feature,p_entity,'night','nyc',current_date);
 end $$;`);
 await db.exec(await readFile(new URL('../migrations/20261021225806_command_center.sql',import.meta.url),'utf8'));
 await db.exec(`set role anon`);
 for(const sql of ['select public.command_center(7)',"select public.touch_app_session(gen_random_uuid(),true)","select public.record_command_events('[]')"])
  await assert.rejects(db.query(sql),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${member}',false)`);
 await assert.rejects(db.query('select public.command_center(7)'),/Founder monitoring/);
 await assert.rejects(db.query('select * from spotted_private.app_sessions'),/permission denied/);
 const sid='00000000-0000-0000-0000-000000001000', eid='00000000-0000-0000-0000-000000001001';
 await db.exec(`select public.touch_app_session('${sid}',true);select public.touch_app_session('${sid}',true)`);
 const event=(await q(`select jsonb_build_array(jsonb_build_object('id','${eid}','event','screen_view','at',now(),'session','${sid}','surface','map')) e`))[0].e;
 await db.query('select public.record_command_events($1)',[JSON.stringify(event)]);
 await db.query('select public.record_command_events($1)',[JSON.stringify(event)]);
 await assert.rejects(db.query('select public.record_command_events($1)',[JSON.stringify([{...event[0],phone:'PRIVATE'}])]),/Unsupported/);
 await assert.rejects(db.query('select public.record_command_events($1)',[JSON.stringify([{...event[0],event:'checkin_created'}])]),/Unsupported/);
 await db.exec(`reset role`);
 assert.equal((await q(`select count(*)::int n from spotted_private.usage_events where client_event_id='${eid}'`))[0].n,1,'offline retry deduplicates');
 assert.equal((await q(`select count(*)::int n from spotted_private.usage_events where session_id='${sid}' and event='session_open'`))[0].n,1,'heartbeat does not create more sessions');
 await db.exec(`update spotted_private.app_sessions set last_seen_at=now()-interval '30 seconds' where id='${sid}';set role authenticated;select public.touch_app_session('${sid}',false);select public.touch_app_session('${sid}',true);reset role`);
 const ended=(await q(`select * from spotted_private.app_sessions where id='${sid}'`))[0];
 assert.ok(ended.ended_at,'late heartbeat cannot resurrect a closed segment');assert.ok(Number(ended.foreground_seconds)>=30&&Number(ended.foreground_seconds)<35);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${demo}',false);select public.touch_app_session('${sid}',true);reset role`);
 assert.equal((await q(`select count(*)::int n from spotted_private.app_sessions where user_id='${demo}'`))[0].n,0,'demo presence excluded');
 await db.exec(`insert into public.friendships values('${founder}','${member}','accepted'),('${member}','${founder}','accepted'),('${member}','${demo}','accepted'),('${member}','${delegated}','accepted');
 insert into public.blocked_users values('${member}','${delegated}');
 update spotted_private.retention_measurement_settings set started_at=now()-interval '60 days';
 update spotted_private.launch_members set completed_at=now()-interval '10 days',grandfathered=false where user_id='${member}';
 insert into spotted_private.usage_events(user_id,event,city,mode,night_date,created_at) values('${member}','screen_view','nyc','night',current_date-9,now()-interval '9 days');
 set role authenticated;select set_config('request.jwt.claim.sub','${founder}',false)`);
 await db.exec(`reset role;
 delete from spotted_private.launch_guests;
 insert into spotted_private.launch_guests(id,invited_at,claimed_at,claimed_by) values(gen_random_uuid(),now()-interval '12 days',now()-interval '11 days','${member}');
 insert into spotted_private.usage_events(user_id,event,entity_id,city,mode,night_date,created_at) values
 ('${member}','friend_request','${founder}','nyc','night',current_date-9,now()-interval '9 days 1 hour'),
 ('${member}','friendship_accepted','${founder}','nyc','night',current_date-9,now()-interval '9 days'),
 ('${member}','checkin_created',null,'nyc','night',current_date-8,now()-interval '8 days');
 update spotted_private.usage_events set created_at=now()-interval '10 minutes' where event='session_open' and session_id='${sid}';
 update spotted_private.usage_events set created_at=now()-interval '9 minutes' where client_event_id='${eid}';
 insert into spotted_private.usage_events(user_id,event,session_id,surface,city,mode,night_date,created_at) values
 ('${member}','venue_selected','${sid}','venue','nyc','night',current_date,now()-interval '8 minutes'),
 ('${member}','checkin_created',null,null,'nyc','night',current_date,now()-interval '7 minutes');
 insert into spotted_private.usage_events(user_id,event,entity_id,related_source_id,notification_type,city,mode,night_date,created_at) values
 ('${member}','notification_opened','${eid}','${sid}','dm','nyc','night',current_date,now()-interval '5 minutes'),
 ('${member}','dm_sent','${sid}',null,null,'nyc','night',current_date,now()-interval '4 minutes');
 set role authenticated;select set_config('request.jwt.claim.sub','${founder}',false);`);
 const report=(await q('select public.command_center(30) r'))[0].r.command;
 assert.deepEqual(report.funnels.acquisition,{invited:1,joined:1,onboarded:1,friend:1,checkin:1});
 assert.deepEqual(report.map_funnel,{opened:1,map:1,venue:1,checkin:1});
 assert.deepEqual(report.funnels.notifications,{opened:1,linkable:1,acted:1});

 assert.equal(report.graph.connections,1,'reciprocal rows count once; demo and blocks excluded');
 assert.equal(report.active.foreground_now,0,'closed sessions are not online');
 const d1=report.retention.find(r=>r.day===1),d30=report.retention.find(r=>r.day===30);
 assert.equal(d1.eligible,1);assert.equal(d1.returned,1);assert.equal(d1.percent,100);
 assert.equal(d30.eligible,0);assert.equal(d30.percent,null,'immature cohorts are not zero retention');
 for(const forbidden of [member,founder,delegated,'user_id','session_id','client_event_id','PRIVATE']) assert.ok(!JSON.stringify(report).includes(forbidden),forbidden);
 await db.exec(`reset role;insert into spotted_private.usage_exclusions values('${member}');set role authenticated`);
 assert.equal((await q('select public.command_center(7) r'))[0].r.command.graph.connections,0,'read-time exclusion applies to graph too');
 await db.exec(`reset role;update spotted_private.launch_operators set founder_monitor=false where user_id='${founder}';set role authenticated`);
 await assert.rejects(db.query('select public.command_center(7)'),/Founder monitoring/);
 await db.exec(`reset role;update spotted_private.launch_operators set founder_monitor=true where user_id='${founder}';`);
 await db.exec(await readFile(new URL('../migrations/20261021225816_command_center_operations.sql',import.meta.url),'utf8'));
 await db.exec(`select spotted_private.sample_command_health();set role authenticated;`);
 await assert.rejects(db.query('select public.claim_launch_alert_emails()'),/permission denied/);
 await assert.rejects(db.query('select spotted_private.sample_command_health()'),/permission denied/);
 assert.equal((await q('select public.command_center(7) r'))[0].r.command.email.status,'not_configured');
 await db.exec(`reset role;update spotted_private.launch_email_settings set enabled=true;select spotted_private.sample_command_health();set role service_role;`);
 const batch=(await q('select public.claim_launch_alert_emails() r'))[0].r;
 assert.ok(batch.length>0,'critical incidents enter email queue');
 assert.equal((await q('select public.claim_launch_alert_emails() r'))[0].r.length,0,'leased deliveries cannot be claimed twice');
 const job=batch[0];
 await db.exec(`select public.finish_launch_alert_email('${job.id}','${job.lease}','test-provider-receipt');reset role;select spotted_private.sample_command_health();set role service_role;`);
 assert.ok(!(await q('select public.claim_launch_alert_emails() r'))[0].r.some(j=>j.id===job.id),'accepted incident never sends twice');
 await db.exec(`reset role;set role anon;`);
 await assert.rejects(db.query('select public.claim_launch_alert_emails()'),/permission denied/);
 await db.exec(`reset role;alter table public.profiles add column display_name text,add column username text;
 alter table spotted_private.launch_members add column profile_saved_at timestamptz;
 create table spotted_private.launch_audit(actor uuid,action text,target uuid,details jsonb);
 update spotted_private.launch_operators set founder_monitor=true where user_id='${founder}';`);
 await db.exec(await readFile(new URL('../migrations/20261021225823_command_center_people.sql',import.meta.url),'utf8'));
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);`);
 await assert.rejects(db.query('select public.command_people()'),/Founder monitoring/);
 await assert.rejects(db.query(`select public.set_measurement_exclusion('${founder}',true)`),/Founder monitoring/);
 await db.exec(`select set_config('request.jwt.claim.sub','${founder}',false);select public.set_measurement_exclusion('${member}',true);`);
 const people=(await q("select public.command_people('excluded',0) r"))[0].r;
 assert.ok(people.rows.some(p=>p.id===member&&p.excluded==='manual'));
 for(const key of ['phone','email','message','lat','lng'])assert.ok(!people.rows.some(p=>key in p),'diagnostics never return '+key);
 await db.exec(`select public.set_measurement_exclusion('${member}',false);reset role;`);
 assert.equal((await q(`select count(*)::int n from spotted_private.usage_exclusions where user_id='${member}'`))[0].n,0,'exclusion is reversible');
 assert.equal((await q(`select count(*)::int n from spotted_private.launch_audit where action='analytics_exclusion'`))[0].n,2,'changes audited');
 await db.exec(`set role anon`);await assert.rejects(db.query('select public.command_people()'),/permission denied/);
 console.log('PASS: founder-only account diagnostics, member/anonymous denial, reversible analytics exclusion and audit log.');
 await db.exec(`reset role;
 insert into public.profiles(id,city,created_at) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'nyc',now()-interval '14 days' from generate_series(1,100)n;
 insert into spotted_private.usage_events(user_id,event,city,mode,night_date,duration_ms,outcome,created_at)
 select ('10000000-0000-4000-8000-'||lpad((1+n%100)::text,12,'0'))::uuid,case when n%5=0 then 'screen_view' else 'api_request' end,'nyc','night',current_date,case when n%5=0 then null else 450 end,case when n%5=0 then null else 'ok' end,now()-make_interval(secs=>n*10)
 from generate_series(1,10000)n;
 set role authenticated;select set_config('request.jwt.claim.sub','${founder}',false);`);
 const timed=Date.now();const populated=(await q('select public.command_center(30) r'))[0].r;
 assert.ok(populated.command.active.wau>=20);console.log(`PASS: 100-account / 10,000-event aggregate fixture in ${Date.now()-timed}ms (local engine, not production load certification).`);
 console.log('PASS: Command Center access, retries/deduplication, foreground lifecycle, demo isolation, graph dedupe/blocking, mature D1/D30 retention and aggregate privacy.');
 console.log('PASS: operational sampling, founder-only email status, service-only queue, lease/delivery deduplication and no sends before setup.');
}
