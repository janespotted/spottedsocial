const { PGlite } = require(process.env.SPOTTED_PGLITE_MODULE || '@electric-sql/pglite');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async()=>{
 const db=new PGlite(); const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const scalar=async(s,a=[])=>Object.values((await q(s,a))[0])[0];
 for(const f of ['audited-schema.sql','audited-storage.sql'])await db.exec(fs.readFileSync(path.join(root,'tests/privacy',f),'utf8'));
 await db.exec('alter table auth.users add column phone text, add column phone_confirmed_at timestamptz; create publication supabase_realtime');
 for(const f of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.startsWith('202609222')||n.includes('_v1_')||/^2026100[567]/.test(n)).sort())await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
 await q("select set_config('request.jwt.claim.role','service_role',false)");
 for(let n=1;n<=4;n++){await q('insert into auth.users(id) values($1)',[id(n)]);await q("insert into profiles(id,display_name,username,city,location_sharing_level) values($1,$2,$3,'nyc','all_friends')",[id(n),'Person '+n,'audit'+n]);await q("insert into spotted_private.night_mode_testers(user_id,override,note) values($1,'night','isolated test')",[id(n)]);}
 await q("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted'),($1,$3,'accepted')",[id(1),id(2),id(3)]);
 for(const n of [100,101])await q("insert into venues(id,name,city,lat,lng,type,is_demo,neighborhood) values($1,$2,'nyc',40.7,-74,'bar',false,'Test')",[id(n),'Test spot '+n]);
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261009213458_release_audit_privacy_and_plan_counts.sql'),'utf8'));
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261012151728_audit_status_access_and_delivery.sql'),'utf8');await db.exec(migration);await db.exec(migration);
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261012153806_audit_delivery_privilege_followup.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261012154708_audit_hide_live_profile_flag.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261012155538_audit_preserve_explicit_invitation_audiences.sql'),'utf8'));
 async function actor(n,sql,args=[],role='authenticated') {
  await db.exec('savepoint actor');await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[n?id(n):'',role]);await db.exec('set local role '+role);
  try{const rows=await q(sql,args);await db.exec('reset role');return {rows};}catch(e){await db.exec('rollback to actor');return {rows:[],error:e.message,code:e.code};}
 }
 const ok=r=>{assert(!r.error,r.error);return r.rows;};const value=r=>Object.values(ok(r)[0])[0];
 const status=async(n,s,venue=100)=>{await q("insert into night_statuses(user_id,status,venue_id,venue_name,expires_at,planning_visibility) values($1,$2,$3,$4,public.night_start_at('nyc',now())+interval '1 day','all_friends') on conflict(user_id) do update set status=excluded.status,venue_id=excluded.venue_id,venue_name=excluded.venue_name,expires_at=excluded.expires_at",[id(n),s,s==='out'?id(venue):null,s==='out'?'Test spot '+venue:null]);};
 const counts=async(n)=>value(await actor(n,'select get_friends_night_counts()'));
 const canSee=async(n,other)=>value(await actor(n,'select can_see_location($1,$2)',[id(n),id(other)]));
 const notes=async(n)=>ok(await actor(n,'select * from notifications where receiver_id=$1',[id(n)]));
 let passed=0,failed=0;async function test(name,f){await db.exec('begin');try{await f();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}finally{await db.exec('rollback');}}
 await test('No participation: totals only, no location or status rows',async()=>{await status(1,'out');assert.equal(await canSee(2,1),false);assert.deepEqual(await counts(2),{out:1,planning:0});assert.equal(ok(await actor(2,'select user_id from night_statuses where user_id=$1',[id(1)])).length,0);});
 await test('Safe profiles mask live status and GPS until participation',async()=>{
  await status(1,'out');await q('update profiles set is_out=true,last_known_lat=40.7,last_known_lng=-74,last_location_at=now() where id=$1',[id(1)]);
  let p=ok(await actor(2,'select is_out,last_known_lat,last_known_lng from get_profiles_safe() where id=$1',[id(1)]))[0];
  assert.deepEqual(p,{is_out:false,last_known_lat:null,last_known_lng:null});
  await status(2,'planning');p=ok(await actor(2,'select is_out,last_known_lat from get_profiles_safe() where id=$1',[id(1)]))[0];
  assert.equal(p.is_out,true);assert.equal(p.last_known_lat,40.7);
  await status(2,'home');assert.equal(ok(await actor(2,'select is_out from get_profiles_safe() where id=$1',[id(1)]))[0].is_out,false);
 });
 for(const s of ['home','off'])await test(s+' gets counts without names',async()=>{await status(1,'out');await status(2,s);assert.equal(await canSee(2,1),false);assert.equal((await counts(2)).out,1);assert.equal((await notes(2)).length,0);});
 for(const s of ['planning','out'])await test(s+' can read eligible friend status',async()=>{await status(2,s);await status(1,'out');assert.equal(await canSee(2,1),true);assert.equal(ok(await actor(2,'select user_id from night_statuses where user_id=$1',[id(1)])).length,1);assert((await notes(2)).some(n=>n.message==='Spotted. Person is out at Test spot 100'));});
 await test('Expired viewer loses access',async()=>{await status(2,'planning');await status(1,'out');await q("update night_statuses set expires_at=now()-interval '1 minute' where user_id=$1",[id(2)]);assert.equal(await canSee(2,1),false);assert.equal((await notes(2)).length,0);});
 await test('Unchanged write does not duplicate; repeated genuine transitions notify',async()=>{await status(2,'planning');await status(1,'planning');await status(1,'planning');assert.equal(await scalar('select count(*)::int from notifications where receiver_id=$1',[id(2)]),1);await status(1,'out');await status(1,'planning');await status(1,'out');assert.equal(await scalar('select count(*)::int from notifications where receiver_id=$1',[id(2)]),4);assert((await notes(2)).some(n=>n.message==='Spotted. Person is out at Test spot 100'));});
 await test('Choosing No hides previously queued alerts at read and dispatch',async()=>{await status(2,'out');await status(1,'out');await status(2,'home');assert.equal((await notes(2)).length,0);assert.equal(await scalar('select count(*)::int from notifications n where receiver_id=$1 and spotted_private.notification_source_visible(n)',[id(2)]),0);});
 await test('Genuine status transitions enter push queue once and No cancels dispatch',async()=>{
  await status(2,'planning'); await status(1,'planning'); await status(1,'out'); await status(1,'out');
  assert.equal(await scalar('select count(*)::int from push_outbox q join notifications n on n.id=q.notification_id where n.receiver_id=$1',[id(2)]),2);
  assert.equal(await scalar('select count(*)::int from notifications n where n.receiver_id=$1 and spotted_private.notification_allowed(n)',[id(2)]),1);
  await status(2,'home');
  assert.equal(await scalar('select count(*)::int from notifications n where n.receiver_id=$1 and spotted_private.notification_allowed(n)',[id(2)]),0);
 });
 await test('TBD audience override is honored at push dispatch',async()=>{
  await status(2,'planning'); await q("update profiles set location_sharing_level='close_friends' where id=$1",[id(1)]);
  await status(1,'planning');
  assert.equal(await scalar('select count(*)::int from notifications n where n.receiver_id=$1 and spotted_private.notification_allowed(n)',[id(2)]),1);
 });
 await test('Explicit invitation eligibility does not reveal whether a friend chose No',async()=>{
  await status(1,'out');await q('update night_statuses set is_private_party=true where user_id=$1',[id(1)]);await status(2,'home');
  const before=ok(await actor(1,'select id from get_party_invite_recipients() order by id'));
  await status(2,'planning');const after=ok(await actor(1,'select id from get_party_invite_recipients() order by id'));
  assert(before.some(p=>p.id===id(2)));assert.deepEqual(after,before);
 });
 await test('Anonymous callers and other viewers cannot probe live-status authorization',async()=>{
  await status(1,'out'); await status(2,'out');
  assert.equal((await actor(null,'select can_see_location($1,$2)',[id(2),id(1)],'anon')).code,'42501');
  assert.equal((await actor(3,'select _can_see_location_unchecked($1,$2)',[id(2),id(1)])).code,'42501');
  assert.equal(value(await actor(3,'select can_see_location($1,$2)',[id(2),id(1)])),false);
 });
 await test('Old venue alert is no longer visible after moving',async()=>{await status(2,'out');await status(1,'out');await status(1,'out',101);assert(!(await notes(2)).some(n=>n.message.includes('spot 100')));});
 await test('Hidden and blocked friends excluded even from counts',async()=>{await status(1,'out');await q('insert into location_hidden(user_id,hidden_from_id) values($1,$2)',[id(1),id(2)]);assert.equal((await counts(2)).out,0);await q('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[id(1),id(3)]);assert.equal((await counts(3)).out,0);});
 await test('Narrow audience and notification opt-out remain respected',async()=>{await status(2,'out');await q("update profiles set location_sharing_level='close_friends' where id=$1",[id(1)]);await status(1,'out');assert.equal((await counts(2)).out,0);assert.equal((await notes(2)).length,0);await q('insert into close_friends(user_id,close_friend_id) values($1,$2)',[id(1),id(2)]);await q("insert into notification_preferences(user_id,out_scope) values($1,'none') on conflict(user_id) do update set out_scope='none'",[id(2)]);await status(1,'planning');assert.equal((await notes(2)).length,0);});
 await test('No anonymous counts or DM writes; private participation helper unavailable',async()=>{for(const sql of ['select get_friends_night_counts()',`select send_dm_once('${id(900)}','${id(901)}','x')`])assert.equal((await actor(null,sql,[],'anon')).code,'42501');assert.equal((await actor(2,'select spotted_private.viewer_participates($1)',[id(1)])).code,'42501');});
 await test('NYC and LA open at 6pm every weekday and handle DST weekends',async()=>{for(const city of ['nyc','la'])for(const day of ['2026-10-12','2026-10-16','2026-10-17','2026-10-18','2026-11-01','2027-03-14']){const zone=city==='la'?'America/Los_Angeles':'America/New_York';assert.equal(await scalar("select to_char(night_mode_opens_at($1,$2::timestamp at time zone $3) at time zone $3,'HH24:MI')",[city,day+' 12:00',zone]),'18:00');}});
 await test('DM lost response retry returns same ID once; changed payload fails',async()=>{const thread=value(await actor(1,'select create_dm_thread($1)',[id(2)]));const args=[id(910),thread,'hello'];const one=value(await actor(1,'select to_jsonb(m) from send_dm_once($1,$2,$3) m',args));const two=value(await actor(1,'select to_jsonb(m) from send_dm_once($1,$2,$3) m',args));assert.equal(one.id,two.id);assert.equal(await scalar('select count(*)::int from dm_messages where id=$1',[id(910)]),1);assert((await actor(1,'select * from send_dm_once($1,$2,$3)',[id(910),thread,'different'])).error);assert((await actor(4,'select * from send_dm_once($1,$2,$3)',[id(911),thread,'intruder'])).error);});
 await db.close();console.log(JSON.stringify({passed,failed}));if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
