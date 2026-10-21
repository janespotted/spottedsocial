// Synthetic PostgreSQL only. No hosted backend connection or production data.
const { PGlite }=require(process.env.SPOTTED_PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async()=>{
 const db=new PGlite();
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const scalar=async(s,a=[])=>Object.values((await q(s,a))[0]||{})[0];
 for(const f of ['audited-schema.sql','audited-storage.sql'])await db.exec(fs.readFileSync(path.join(root,'tests/privacy',f),'utf8'));
 await db.exec('alter table auth.users add column phone text, add column phone_confirmed_at timestamptz; create publication supabase_realtime');
 for(const f of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.startsWith('202609222')||n.includes('_v1_')||/^2026100[5679]/.test(n)).sort())await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
 await q("select set_config('request.jwt.claim.role','service_role',false)");
 for(let n=1;n<=8;n++){await q('insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,now())',[id(n),'1202555'+String(n).padStart(4,'0')]);await q("insert into profiles(id,display_name,username,city,location_sharing_level) values($1,$2,$3,'nyc','all_friends')",[id(n),'Alex Fullname '+n,'ux'+n]);}
 for(const f of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>/^2026101/.test(n)&&!n.includes('hot_spots')).sort())await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261021102526_ux_planning_retention.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261021104259_ux_delivery_guards.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261021104638_retention_connections_and_controls.sql'),'utf8'));
 for(let n=1;n<=6;n++){await q("insert into spotted_private.night_mode_testers(user_id,override,note) values($1,'night','synthetic') on conflict(user_id) do update set override='night'",[id(n)]);await q('insert into spotted_private.launch_operators(user_id,city_tester) values($1,true) on conflict(user_id) do update set city_tester=true',[id(n)]);}
 for(const n of [2,3,4])await q("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')",[id(1),id(n)]);
 await q("insert into venues(id,name,city,lat,lng,type,is_demo,neighborhood) values($1,'Synthetic Venue','nyc',40.7,-74,'bar',false,'Test')",[id(100)]);
 async function actor(n,sql,args=[],role='authenticated'){
  await db.exec('savepoint actor');await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[n?id(n):'',role]);await db.exec('set local role '+role);
  try{const rows=await q(sql,args);await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true)");return {rows};}
  catch(e){await db.exec('rollback to actor');return {rows:[],code:e.code,error:e.message};}
 }
 const ok=r=>{assert(!r.error,r.error);return r.rows;};
 let passed=0,failed=0;async function test(name,fn){await db.exec('begin');try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}finally{await db.exec('rollback');}}
 const status=async(n,s)=>q("insert into night_statuses(user_id,status,venue_id,venue_name,expires_at,planning_visibility) values($1,$2,$3,$4,now()+interval '4 hours','all_friends') on conflict(user_id) do update set status=excluded.status,venue_id=excluded.venue_id,venue_name=excluded.venue_name,expires_at=excluded.expires_at",[id(n),s,s==='out'?id(100):null,s==='out'?'Synthetic Venue':null]);
 const alerts=async()=>q("select * from notifications where receiver_id=$1 and type in ('friend_out','friend_planning')",[id(1)]);
 await test('each friend can alert immediately; no two-alert recipient cap',async()=>{
  await status(1,'out');for(const n of [2,3,4])await status(n,'out');
  assert.equal((await alerts()).length,3);assert.deepEqual(new Set((await alerts()).map(x=>x.sender_id)),new Set([id(2),id(3),id(4)]));
 });
 await test('same friend TBD then Out each alerts; identical transition cannot repeat',async()=>{
  await status(1,'out');await status(2,'planning');await status(2,'out');await status(2,'out');await status(2,'home');await status(2,'out');
  assert.deepEqual((await alerts()).map(x=>x.type).sort(),['friend_out','friend_planning']);
 });
 await test('close-friend choice and current sharing permissions still apply',async()=>{
  await status(1,'out');await q("insert into notification_preferences(user_id,out_scope) values($1,'close')",[id(1)]);
  await q('insert into close_friends(user_id,close_friend_id) values($1,$2)',[id(1),id(2)]);
  await status(2,'out');await status(3,'out');assert.equal((await alerts()).length,1);
  await q('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[id(1),id(2)]);
  assert.equal(await scalar('select push_notification_allowed($1)',[(await alerts())[0].id]),false);
 });
 const thread=async()=>ok(await actor(1,'select create_dm_thread($1) id',[id(2)]))[0].id;
 await test('mute suppresses queued DM push but keeps readable message and inbox row',async()=>{
  const tid=await thread();ok(await actor(1,'select send_dm_once($1,$2,$3)',[id(991),tid,'synthetic message']));
  const note=(await q("select * from notifications where receiver_id=$1 and type='dm'",[id(2)]))[0];
  assert.equal(await scalar('select push_notification_allowed($1)',[note.id]),true);
  assert.equal(ok(await actor(2,"select conversation_notification_preference('dm',$1,true) muted",[tid]))[0].muted,true);
  assert.equal(await scalar('select push_notification_allowed($1)',[note.id]),false);
  assert.equal(ok(await actor(2,'select id from notifications where id=$1',[note.id])).length,1);
  assert.equal(ok(await actor(2,'select id from dm_messages where id=$1',[id(991)])).length,1);
  ok(await actor(2,"select conversation_notification_preference('dm',$1,false)",[tid]));
  assert.equal(await scalar('select push_notification_allowed($1)',[note.id]),true);
 });
 await test('non-member cannot read or change another conversation mute',async()=>{
  const tid=await thread();assert.equal((await actor(3,"select conversation_notification_preference('dm',$1,true)",[tid])).code,'42501');
  assert.equal((await actor(2,'select * from spotted_private.conversation_notification_preferences')).code,'42501');
  assert.equal((await actor(null,"select conversation_notification_preference('dm',$1,true)",[tid],'anon')).code,'42501');
 });
 const code=async()=>{await q("insert into invite_codes(id,user_id,code,expires_at,max_uses) values($1,$2,'ABCDEFGH',now()+interval '1 day',5)",[id(800),id(1)]);};
 await test('invitation preview creates no relationship; explicit request stays pending',async()=>{
  await code();const preview=ok(await actor(5,"select connect_invitation('ABCDEFGH') value"))[0].value;
  assert.equal(preview.user_id,id(1));assert.equal(preview.state,'available');
  assert.equal(await scalar('select count(*)::int from friendships where user_id=$1 or friend_id=$1',[id(5)]),0);
  const response=ok(await actor(5,"select connect_invitation('ABCDEFGH',true) value"))[0].value;assert.equal(response.state,'requested');
  const again=ok(await actor(5,"select connect_invitation('ABCDEFGH',true) value"))[0].value;assert.equal(again.request_created,false);
  assert.equal(await scalar('select status from friendships where user_id=$1 and friend_id=$2',[id(5),id(1)]),'pending');
  assert.equal(await scalar('select count(*)::int from invite_uses where invited_user_id=$1',[id(5)]),1);
  assert.equal(await scalar('select uses_count from invite_codes where id=$1',[id(800)]),1);
 });
 await test('incoming friend request is never auto-accepted by a profile link',async()=>{
  await code();await q("insert into friendships(user_id,friend_id,status) values($1,$2,'pending')",[id(1),id(5)]);
  assert.equal(ok(await actor(5,"select connect_invitation('ABCDEFGH',true) value"))[0].value.state,'incoming');
  assert.equal(await scalar('select status from friendships where user_id=$1 and friend_id=$2',[id(1),id(5)]),'pending');
 });
 await test('expired and blocked invitations do not reveal or connect the inviter',async()=>{
  await code();await q('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[id(1),id(5)]);
  assert.equal((await actor(5,"select connect_invitation('ABCDEFGH',true)")).code,'22023');
  await q("update invite_codes set expires_at=now()-interval '1 second' where id=$1",[id(800)]);
  assert.equal((await actor(6,"select connect_invitation('ABCDEFGH')")).code,'22023');
 });
 await test('invitation link does not bypass admission or anonymous access',async()=>{
  await code();await q('delete from spotted_private.launch_operators where user_id=$1',[id(8)]);
  await q('update spotted_private.launch_members set completed_at=null where user_id=$1',[id(8)]);
  assert.equal((await actor(8,"select connect_invitation('ABCDEFGH',true)")).code,'42501');
  assert.equal((await actor(null,"select connect_invitation('ABCDEFGH',true)",[],'anon')).code,'42501');
 });
 await test('exact notification opens dedupe and cannot be forged for another recipient',async()=>{
  await q("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')",[id(7),id(8)]);
  const tid=ok(await actor(7,'select create_dm_thread($1) id',[id(8)]))[0].id;
  ok(await actor(7,'select send_dm_once($1,$2,$3)',[id(995),tid,'synthetic measurement']));
  const note=(await q("select id from notifications where type='dm' and receiver_id=$1",[id(8)]))[0].id;
  ok(await actor(7,'select record_notification_open($1)',[note]));
  assert.equal(await scalar("select count(*)::int from spotted_private.usage_events where event='notification_opened'"),0);
  ok(await actor(8,'select record_notification_open($1)',[note]));ok(await actor(8,'select record_notification_open($1)',[note]));
  assert.equal(await scalar("select count(*)::int from spotted_private.usage_events where event='notification_opened'"),1);
  ok(await actor(8,'select send_dm_once($1,$2,$3)',[id(996),tid,'reply']));
  const report=await scalar('select retention_report()');assert.equal(report.notification_opens,1);assert.equal(report.opens_followed_by_matching_action,1);
  assert(!JSON.stringify(report).includes(id(8)));assert.equal((await actor(8,'select retention_report()')).code,'42501');
 });
 await test('weekly reminder suppression honors status and real coordination',async()=>{
  assert.equal(await scalar('select spotted_private.planning_reminder_eligible($1)',[id(7)]),true);
  await status(7,'home');assert.equal(await scalar('select spotted_private.planning_reminder_eligible($1)',[id(7)]),false);
  await q('delete from night_statuses where user_id=$1',[id(7)]);
  await q("select spotted_private.record_usage($1,'plan_created','plan',$2)",[id(7),id(901)]);
  assert.equal(await scalar('select spotted_private.planning_reminder_eligible($1)',[id(7)]),false);
 });
 await test('weekly reminder reservation survives notification cleanup and dedupes',async()=>{
  await q("insert into spotted_private.reminder_deliveries(user_id,week_date,kind) values($1,current_date,'weekend_rally') on conflict do nothing",[id(7)]);
  await q("insert into spotted_private.reminder_deliveries(user_id,week_date,kind) values($1,current_date,'weekend_rally') on conflict do nothing",[id(7)]);
  await q('select nightly_reset()');assert.equal(await scalar('select count(*)::int from spotted_private.reminder_deliveries where user_id=$1',[id(7)]),1);
  assert.equal(await scalar('select campaigns_enabled from spotted_private.push_settings'),false);assert.equal(await scalar('select enqueue_scheduled_pushes()'),0);
 });
 await test('cohort report includes only observed mature W0 W1 W2 W4 windows',async()=>{
  await q("update spotted_private.retention_measurement_settings set started_at=now()-interval '90 days'");
  await q("update spotted_private.launch_members set completed_at=now()-interval '45 days' where user_id=$1",[id(7)]);
  await q("insert into spotted_private.usage_events(user_id,event,feature,mode,city,night_date,created_at) values($1,'plan_created','plan','day','nyc',current_date,(date_trunc('week',(now()-interval '45 days') at time zone 'America/New_York')+interval '11 days 12 hours') at time zone 'America/New_York')",[id(7)]);
  const report=await scalar('select retention_report(60)');assert.deepEqual(report.cohorts.map(x=>x.week),[0,1,2,4]);
  assert(report.cohorts.every(x=>x.cohort_size===1));assert.equal(report.cohorts[0].active_users,1);
 });
 await test('private retention and preference tables have RLS and no client privileges',async()=>{
  for(const name of ['conversation_notification_preferences','reminder_deliveries','retention_measurement_settings']){
   assert.equal(await scalar("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='spotted_private' and c.relname=$1",[name]),true);
   assert.equal(await scalar("select has_table_privilege('authenticated',$1,'SELECT')",['spotted_private.'+name]),false);
  }
 });
 await test('plan-chat mute is separate from invitation and friend-activity preferences',async()=>{
  const pid=ok(await actor(1,'select save_plan(null,$1,$2::uuid[]) id',[{venue_id:id(100),plan_date:new Date(Date.now()+2*86400000).toISOString().slice(0,10),plan_time:'21:00',visibility:'friends'},[id(2)]]))[0].id;
  ok(await actor(2,"insert into plan_comments(plan_id,user_id,text) values($1,$2,'synthetic plan reply')",[pid,id(2)]));
  const note=(await q("select id from notifications where type='plan_comment' and receiver_id=$1",[id(1)]))[0].id;
  assert.equal(await scalar('select push_notification_allowed($1)',[note]),true);
  ok(await actor(1,"select conversation_notification_preference('plan',$1,true)",[pid]));
  assert.equal(await scalar('select push_notification_allowed($1)',[note]),false);
  assert.equal(ok(await actor(1,'select id from notifications where id=$1',[note])).length,1);
  await status(1,'out');await status(2,'out');assert.equal((await alerts()).length,1);
 });
 await test('recap alert requires its actual nonempty unexpired owner recap at send time',async()=>{
  await q('update spotted_private.push_settings set delivery_enabled=true,campaigns_enabled=true');
  await q('insert into notification_preferences(user_id,recap_enabled) values($1,true)',[id(7)]);
  await q("insert into night_recaps(id,user_id,city,night_date,expires_at) values($1,$2,'nyc',current_date,now()+interval '1 day')",[id(850),id(7)]);
  await q("insert into notifications(id,sender_id,receiver_id,type,message,data,event_key) values($1,$2,$2,'morning_after','Synthetic replay ready',jsonb_build_object('recap_id',$3::text),'test-recap-ready')",[id(851),id(7),id(850)]);
  assert.equal(await scalar('select push_notification_allowed($1)',[id(851)]),false);
  await q("insert into night_recap_stops(recap_id,position,venue_id,venue_name,arrived_at) values($1,1,$2,'Synthetic Venue',now()-interval '10 hours')",[id(850),id(100)]);
  assert.equal(await scalar('select push_notification_allowed($1)',[id(851)]),true);
  assert.equal(ok(await actor(7,'select id from notifications where id=$1',[id(851)])).length,1);
  assert.equal(ok(await actor(8,'select id from notifications where id=$1',[id(851)])).length,0);
  await q("update night_recaps set expires_at=now()-interval '1 second' where id=$1",[id(850)]);
  assert.equal(await scalar('select push_notification_allowed($1)',[id(851)]),false);
 });
 await db.close();console.log(JSON.stringify({passed,failed}));if(failed)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
