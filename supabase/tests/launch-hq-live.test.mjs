import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function testLiveMonitoring(db,{founder,member,demo,delegated}) {
 const q=async sql=>(await db.query(sql)).rows;
 await db.exec(`reset role; create table auth.users(id uuid primary key); insert into auth.users values('${founder}'),('${member}');
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 9::bigint$$;
 delete from spotted_private.usage_exclusions;`);
 await db.exec(await readFile(new URL('../migrations/20261021220858_launch_hq_live_alerts.sql',import.meta.url),'utf8'));
 await db.exec(`set role anon;`);
 for(const sql of ['select public.launch_monitor_live(7)','select * from public.launch_monitor_signal',"select public.record_client_health(gen_random_uuid(),'heartbeat','web')","select public.acknowledge_launch_alert(gen_random_uuid())"])
  await assert.rejects(db.query(sql),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${member}',false)`);
 assert.equal((await q('select * from public.launch_monitor_signal')).length,0);
 await assert.rejects(db.query('select public.launch_monitor_live(7)'),/Founder monitoring access/);
 await assert.rejects(db.query('select spotted_private.evaluate_launch_alerts()'),/permission denied/);
 await assert.rejects(db.query('select * from spotted_private.client_health_events'),/permission denied/);
 await assert.rejects(db.query('select * from spotted_private.launch_alerts'),/permission denied/);
 await assert.rejects(db.query("update public.launch_monitor_signal set changed_at=now()"),/permission denied/);
 await assert.rejects(db.query("select public.record_client_health(gen_random_uuid(),'native_crash','ios')"),/Unsupported/);
 await assert.rejects(db.query("select public.record_client_health(gen_random_uuid(),'lat=40.123','web')"),/Unsupported/);
 await assert.rejects(db.query("select public.record_client_health(gen_random_uuid(),null,'web')"),/Unsupported/);
 const eid='00000000-0000-0000-0000-000000000099';
 await db.exec(`select public.record_client_health('${eid}','render_error','web');select public.record_client_health('${eid}','render_error','web');
 select public.record_client_health(gen_random_uuid(),'heartbeat','web');select public.record_client_health(gen_random_uuid(),'heartbeat','web');`);
 await db.exec(`select set_config('request.jwt.claim.sub','${demo}',false);select public.record_client_health(gen_random_uuid(),'render_error','web');reset role;`);
 assert.equal((await q('select count(*)::int n from spotted_private.client_health_events'))[0].n,2,'deduplication, heartbeat throttle, demo exclusion');
 await db.exec(`insert into spotted_private.launch_guests(id,invited_at,claimed_at,claimed_by) values
 (gen_random_uuid(),now()-interval '1 day',now()-interval '1 hour','${member}'),
 (gen_random_uuid(),now()-interval '1 day',null,null),
 (gen_random_uuid(),now()-interval '10 days',now()-interval '9 days','${founder}');
 insert into public.push_logs(success,error) values(false,'PRIVATE ERROR 40.123'),(false,'PRIVATE ERROR 40.123');
 select spotted_private.evaluate_launch_alerts();set role authenticated;select set_config('request.jwt.claim.sub','${founder}',false);`);
 const report=(await q('select public.launch_monitor_live(7) r'))[0].r;
 assert.equal(report.conversion.invited,2);assert.equal(report.conversion.claimed,1);assert.equal(report.conversion.completed,1);
 assert.equal(report.conversion.claim_percent,50);assert.equal(report.conversion.completion_percent,50);
 assert.equal(report.client_health.reports,1);assert.equal(report.client_health.reporting_people,1);assert.equal(report.client_health.native_status,'not_connected');
 assert.equal((await q('select * from public.launch_monitor_signal')).length,1);
 for(const secret of [member,founder,'40.123','PRIVATE ERROR','acknowledged_by','user_id','payload','latitude','longitude']) assert.ok(!JSON.stringify(report).includes(secret),secret);
 const clientAlert=report.alerts.find(a=>a.alert_key==='client_errors');assert.ok(clientAlert);
 assert.ok(report.alerts.find(a=>a.alert_key==='push_failures'));
 await db.exec(`select public.acknowledge_launch_alert('${clientAlert.id}');`);
 assert.ok((await q('select public.launch_monitor_live(7) r'))[0].r.alerts.find(a=>a.id===clientAlert.id).acknowledged_at);
 await db.exec('reset role;select spotted_private.evaluate_launch_alerts();');
 assert.equal((await q("select count(*)::int n from spotted_private.launch_alerts where alert_key='client_errors'"))[0].n,1,'repeat evaluation deduplicates open incidents');
 await db.exec(`update spotted_private.client_health_events set created_at=now()-interval '20 minutes';select spotted_private.evaluate_launch_alerts();`);
 assert.ok((await q(`select resolved_at from spotted_private.launch_alerts where id='${clientAlert.id}'`))[0].resolved_at);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);select public.record_client_health(gen_random_uuid(),'render_error','ios');reset role;select spotted_private.evaluate_launch_alerts();`);
 const reopened=await q("select * from spotted_private.launch_alerts where alert_key='client_errors' and resolved_at is null");
 assert.equal(reopened.length,1);assert.notEqual(reopened[0].id,clientAlert.id);assert.equal(reopened[0].acknowledged_at,null);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);
 select public.record_client_health(gen_random_uuid(),'unhandled_error','web') from generate_series(1,20); reset role;`);
 assert.equal((await q(`select count(*)::int n from spotted_private.client_health_events where user_id='${member}' and kind<>'heartbeat' and created_at>now()-interval '1 minute'`))[0].n,10,'server rate cap cannot be bypassed by repeated requests');
 await db.exec(`update spotted_private.launch_guests set invited_at=now()-interval '40 days';set role authenticated;select set_config('request.jwt.claim.sub','${founder}',false);`);
 const empty=(await q('select public.launch_monitor_live(7) r'))[0].r;
 assert.equal(empty.conversion.invited,0);assert.equal(empty.conversion.claim_percent,null);
 await db.exec('reset role');
 await db.exec(`insert into spotted_private.usage_exclusions values('${member}');set role authenticated;select set_config('request.jwt.claim.sub','${founder}',false);`);
 assert.equal((await q('select public.launch_monitor_live(7) r'))[0].r.client_health.reports,0);
 await db.exec(`reset role;update spotted_private.launch_operators set founder_monitor=false where user_id='${founder}';set role authenticated;`);
 await assert.rejects(db.query('select public.launch_monitor_live(7)'),/Founder monitoring access/);
 await assert.rejects(db.query(`select public.acknowledge_launch_alert('${reopened[0].id}')`),/Founder monitoring access/);
 assert.equal((await q('select * from public.launch_monitor_signal')).length,0,'revocation blocks realtime row immediately');
 await db.exec(`select set_config('request.jwt.claim.sub','${delegated}',false)`);
 await assert.rejects(db.query('select public.launch_monitor_live(7)'),/Founder monitoring access/);
 console.log('PASS: live counts, cohort conversion, fixed-vocabulary health ingestion, dedup/throttle/exclusions, durable alerts/ack/recovery/reopen, founder/anon/member/delegated/revoked access, realtime RLS and privacy.');
}
