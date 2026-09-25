// Synthetic roles only; never connects to or mutates a hosted backend.
const {PGlite}=require(process.env.SPOTTED_PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [A,C,F,M,U,BR]=[1,2,3,4,5,6].map(id),V=id(100);const results=[];
(async()=>{
 const db=new PGlite();
 await db.exec(fs.readFileSync(root+'/tests/privacy/audited-schema.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/tests/privacy/audited-storage.sql','utf8'));
 await db.exec('alter table auth.users add column phone text');
 for(const name of fs.readdirSync(root+'/supabase/migrations').filter(n=>n.startsWith('202609222')||n.includes('_v1_')).sort())await db.exec(fs.readFileSync(root+'/supabase/migrations/'+name,'utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const scalar=async(sql,args=[])=>Object.values((await q(sql,args))[0]||{})[0];
 async function actor(who,sql,args=[]){
  await db.exec('savepoint actor');await q("select set_config('request.jwt.claim.sub',$1,true)",[who||'']);await db.exec('set local role '+(who?'authenticated':'anon'));
  try {const rows=await q(sql,args);await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',true)");return{rows};}
  catch(e){await db.exec('rollback to actor');return{rows:[],code:e.code,error:e.message};}
 }
 const denied=r=>r.code==='42501'||(!r.error&&r.rows.length===0);
 async function test(name,fn){await db.exec('begin');try{await fn();results.push({name,passed:true});console.log('PASS',name);}finally{await db.exec('rollback');}}
 for(const [i,u] of [A,C,F,M,U,BR].entries()) {await q('insert into auth.users(id,phone) values($1,$2)',[u,'1555000000'+i]);await q("insert into profiles(id,display_name,username,city) values($1,$2,$3,'nyc')",[u,'Synthetic '+i,'synthetic'+i]);}
 for(const [a,b] of [[A,C],[A,F],[C,F],[A,BR],[BR,M]]) await q("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')",[a,b]);
 await q('insert into close_friends(user_id,close_friend_id) values($1,$2)',[A,C]);
 await q("insert into venues(id,name,city,lat,lng,type,is_demo,neighborhood) values($1,'Test bar','nyc',40.7,-74,'bar',false,'Test')",[V]);
 const post=async(visibility='all_friends')=>(await q("insert into posts(user_id,text,visibility,expires_at) values($1,'Synthetic',$2,now()+interval '2 hours') returning id",[A,visibility]))[0].id;
 await test('QA-02 leaderboard metadata is allowed while raw GPS stays denied',async()=>{
  await q("insert into night_statuses(user_id,status,venue_id,venue_name,expires_at) values($1,'out',$2,'Test bar',now()+interval '1 hour')",[A,V]);
  assert.equal((await actor(F,"select user_id,venue_id,venue_name,updated_at from night_statuses where status='out' and expires_at>now()")).rows.length,1);
  assert.equal((await actor(F,'select lat from night_statuses')).code,'42501');
  assert.equal((await actor(U,"select user_id from night_statuses where user_id=$1",[A])).rows.length,0);
 });
 await test('QA-05 eligible common friend is selectable and receives shared post in canonical DM',async()=>{
  const p=await post(),eligible=await actor(C,'select * from get_post_share_recipients($1)',[p]);assert(eligible.rows.some(r=>r.id===F));
  const sent=await actor(C,'select share_post_to_dm($1,$2) thread',[p,F]);assert(!sent.error,sent.error);
  assert.equal(Number(await scalar('select count(*) from dm_thread_members where thread_id=$1',[sent.rows[0].thread])),2);
  assert.equal(Number(await scalar('select count(*) from dm_messages where thread_id=$1',[sent.rows[0].thread])),1);
 });
 await test('QA-05 CF recipient rules cannot be widened by share or stale picker',async()=>{
  const p=await post('close_friends');assert(!(await actor(A,'select * from get_post_share_recipients($1)',[p])).rows.some(r=>r.id===F));
  assert(denied(await actor(A,'select share_post_to_dm($1,$2)',[p,F])));
  await q('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[C,A]);
  assert(denied(await actor(A,'select share_post_to_dm($1,$2)',[p,C])));assert(denied(await actor(U,'select * from get_post_share_recipients($1)',[p])));
  assert(denied(await actor(null,'select * from get_post_share_recipients($1)',[p])));
 });
 await test('QA-05 expired post cannot be sent; authorized friend still works before expiry',async()=>{
  const p=await post();assert((await actor(A,'select * from get_post_share_recipients($1)',[p])).rows.some(r=>r.id===F));
  await q("update posts set expires_at=now()-interval '1 minute' where id=$1",[p]);assert(denied(await actor(A,'select share_post_to_dm($1,$2)',[p,F])));
 });
 await test('QA-19 availability is caller-bound and normalized duplicate insert/update is rejected',async()=>{
  assert.equal((await actor(F,"select username_available(' SYNTHETIC0 ') available")).rows[0].available,false);
  assert.equal((await actor(A,"select username_available('synthetic0') available")).rows[0].available,true);
  assert.equal((await actor(F,"select username_available('unused_handle') available")).rows[0].available,true);
  assert.equal((await actor(F,"update profiles set username=' Synthetic0 ' where id=$1",[F])).code,'23505');
  assert.equal((await actor(F,"update profiles set username='unused_handle' where id=$1 returning username",[F])).rows[0].username,'unused_handle');
  assert(denied(await actor(null,"select username_available('synthetic0')")));
 });
 await test('QA-36 party picker lists only active eligible guests and never grants address access',async()=>{
  await q("update profiles set location_sharing_level='close_friends' where id=$1",[A]);
  await q("insert into night_statuses(user_id,status,is_private_party,party_address,expires_at) values($1,'out',true,'Private address',now()+interval '1 hour')",[A]);
  const eligible=await actor(A,'select * from get_party_invite_recipients()');assert(eligible.rows.some(r=>r.id===C));assert(!eligible.rows.some(r=>r.id===F));
  const invite=await actor(A,"select party_request($1,$2,'invite') id",[A,C]);assert(!invite.error,invite.error);
  assert(!((await actor(C,'select approved_party_address($1) address',[A])).rows[0]?.address));
  await q('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[C,A]);assert.equal((await actor(A,'select * from get_party_invite_recipients()')).rows.length,0);
  assert.equal((await actor(U,'select * from get_party_invite_recipients()')).rows.length,0);assert(denied(await actor(null,'select * from get_party_invite_recipients()')));
  await q('delete from blocked_users where blocker_id=$1',[C]);await q("update night_statuses set expires_at=now()-interval '1 minute' where user_id=$1",[A]);assert.equal((await actor(A,'select * from get_party_invite_recipients()')).rows.length,0);
 });
 await test('QA-09 atomic status trigger uses newly chosen audience, never the previous broader setting',async()=>{
  const saved=await actor(A,'select commit_night_status($1,null,$2)',[{user_id:A,status:'out',venue_id:V,venue_name:'Test bar',is_private_party:false},'close_friends']);assert(!saved.error,saved.error);
  const recipients=await q("select receiver_id from notifications where sender_id=$1 and type='friend_out'",[A]);assert(recipients.some(r=>r.receiver_id===C));assert(!recipients.some(r=>r.receiver_id===F));
 });
 const commit=async(user=A,patch={},fix=null)=>actor(user,'select commit_night_status($1,$2) result',[
  {user_id:user,status:'out',venue_id:V,venue_name:'Test bar',is_private_party:false,automatic_venue_updates:true,...patch},fix]);
 await test('QA-09/11 atomic check-in publishes one coherent visit; repeated manual check-in leaves one open row',async()=>{
  const fix={lat:40.7,lng:-74,accuracy:10,recordedAt:new Date().toISOString()};
  const first=await commit(A,{},fix);assert(!first.error,first.error);assert.equal(first.rows[0].result.gps_shared,true);
  const second=await commit(A,{},fix);assert(!second.error,second.error);
  assert.equal(Number(await scalar('select count(*) from checkins where user_id=$1 and ended_at is null',[A])),1);
  assert.equal((await q('select is_out,last_known_lat from profiles where id=$1',[A]))[0].last_known_lat,40.7);
  assert.equal((await actor(A,"insert into checkins(user_id,venue_name,lat,lng) values($1,'Duplicate',40.7,-74)",[A])).code,'23505');
 });
 await test('QA-09 late transaction failure rolls back status, profile, checkin and notifications',async()=>{
  await db.exec("create function pg_temp.fail_visit() returns trigger language plpgsql as $$ begin raise exception 'Simulated write failure';end $$;create trigger qa_fail before insert on checkins for each row execute function pg_temp.fail_visit()");
  const result=await commit(A,{}, {lat:40.7,lng:-74,accuracy:10,recordedAt:new Date().toISOString()});assert(result.error);
  assert.equal(Number(await scalar('select count(*) from night_statuses where user_id=$1',[A])),0);
  assert.equal((await q('select last_known_lat from profiles where id=$1',[A]))[0].last_known_lat,null);
  assert.equal(Number(await scalar('select count(*) from notifications where sender_id=$1',[A])),0);
 });
 await test('QA-09/12 manual no-GPS check-in never invents a pin or GPS visit; Home revokes sharing atomically',async()=>{
  const saved=await commit();assert(!saved.error,saved.error);assert.equal(saved.rows[0].result.gps_shared,false);
  assert.equal(Number(await scalar('select count(*) from checkins where user_id=$1',[A])),0);
  assert.equal((await actor(F,'select last_known_lat from get_profiles_safe() where id=$1',[A])).rows[0].last_known_lat,null);
  const home=await commit(A,{status:'home'});assert(!home.error,home.error);assert.equal((await q('select is_out from profiles where id=$1',[A]))[0].is_out,false);
 });
 await test('QA-09 atomic status cannot impersonate another account or trust client expiry',async()=>{
  assert(denied(await actor(F,"select commit_night_status($1)",[{user_id:A,status:'out'}])));
  const result=await commit(A,{expires_at:'2099-01-01',updated_at:'2000-01-01'});assert(!result.error,result.error);
  assert.equal(await scalar("select expires_at<now()+interval '26 hours' and updated_at>now()-interval '1 minute' from night_statuses where user_id=$1",[A]),true);
 });
 await test('QA-10 manual hold prevents reassignment but accepts GPS; automatic arrival works after hold',async()=>{
  const other=id(101);await q("insert into venues(id,name,city,lat,lng,type,is_demo,neighborhood) values($1,'Adjacent bar','nyc',40.7007,-74,'bar',false,'Test')",[other]);
  const saved=await commit();assert(!saved.error,saved.error);
  await q("update night_statuses set updated_at=now()-interval '110 seconds' where user_id=$1",[A]);
  let revision=(await q('select updated_at from night_statuses where user_id=$1',[A]))[0].updated_at;
  for(const seconds of [90,55,15,0]) {const result=await actor(A,'select record_live_location(40.7007,-74,10,now()-make_interval(secs=>$1),$2,0) result',[seconds,revision]);assert(!result.error,result.error);}
  assert.equal(await scalar('select venue_id from night_statuses where user_id=$1',[A]),V);
  assert.equal(await scalar('select last_known_lat from profiles where id=$1',[A]),40.7007);
  await q("update night_statuses set manual_venue_until=now()-interval '1 second' where user_id=$1",[A]);
  await q('update profiles set last_location_at=null where id=$1',[A]);
  await q('delete from live_location_state where user_id=$1',[A]);
  for(const seconds of [90,55,15,0]) {const result=await actor(A,'select record_live_location(40.7007,-74,10,now()-make_interval(secs=>$1),$2,0) result',[seconds,revision]);assert(!result.error,result.error);}
  assert.equal(await scalar('select venue_id from night_statuses where user_id=$1',[A]),other);
 });
 await test('QA-10 genuine departure still clears a manually held venue without inventing another arrival',async()=>{
  const saved=await commit(A,{}, {lat:40.7,lng:-74,accuracy:10,recordedAt:new Date().toISOString()});assert(!saved.error,saved.error);
  await q("update night_statuses set updated_at=now()-interval '110 seconds' where user_id=$1",[A]);
  await q('update profiles set last_location_at=null where id=$1',[A]);
  const revision=await scalar('select updated_at from night_statuses where user_id=$1',[A]);
  for(const seconds of [80,40]) {const result=await actor(A,'select record_live_location(40.705,-74,10,now()-make_interval(secs=>$1),$2,0)',[seconds,revision]);assert(!result.error,result.error);}
  assert.equal(await scalar('select venue_id from night_statuses where user_id=$1',[A]),null);
  assert.equal(Number(await scalar('select count(*) from checkins where user_id=$1 and ended_at is null',[A])),0);
 });
 await test('QA-09/12 party preserves approved coordinates, never profile GPS, and invitation is not address consent',async()=>{
  const result=await commit(A,{is_private_party:true,party_address:'Synthetic address'}, {lat:40.7,lng:-74,accuracy:10,recordedAt:new Date().toISOString()});assert(!result.error,result.error);assert.equal(result.rows[0].result.gps_shared,false);
  assert.equal(await scalar('select last_known_lat from profiles where id=$1',[A]),null);assert.equal(Number(await scalar('select count(*) from checkins where user_id=$1',[A])),0);
  assert.equal((await actor(A,'select lat from party_locations where user_id=$1',[A])).rows[0].lat,40.7);
  const invite=(await actor(A,"select party_request($1,$2,'invite') id",[A,C])).rows[0].id;await actor(C,'select respond_party_request($1,true)',[invite]);
  // V1 deliberately gives eligible Close Friends a pin, independently of street-address consent.
  assert.equal((await actor(C,'select lat from party_locations where user_id=$1',[A])).rows[0].lat,40.7);
  assert.equal((await actor(F,'select lat from party_locations where user_id=$1',[A])).rows.length,0);
  assert.equal((await actor(C,'select approved_party_address($1) address',[A])).rows[0].address,null);
  const address=(await actor(C,"select party_request($1,$2,'address') id",[A,C])).rows[0].id;const approve=await actor(A,'select respond_party_request($1,true)',[address]);assert(!approve.error,approve.error);
  assert.equal((await actor(C,'select approved_party_address($1) address',[A])).rows[0].address,'Synthetic address');
  assert.equal((await actor(C,'select lat from party_locations where user_id=$1',[A])).rows[0].lat,40.7);
 });
 await test('QA-08 unread sender recall returns an actual deleted row; read invite remains and returns none',async()=>{
  const pending=(await actor(A,"select * from create_notification($1,'venue_invite','Synthetic invite')",[F])).rows[0];assert(pending?.id);
  assert.equal((await actor(A,'select id from notifications where id=$1',[pending.id])).rows.length,1);
  assert.equal((await actor(A,'delete from notifications where id=$1 returning id',[pending.id])).rows.length,1);
  const seen=(await actor(A,"select * from create_notification($1,'venue_invite','Synthetic invite')",[F])).rows[0];assert(seen?.id);
  await actor(F,'update notifications set is_read=true where id=$1',[seen.id]);assert.equal((await actor(A,'delete from notifications where id=$1 returning id',[seen.id])).rows.length,0);
  assert.equal(Number(await scalar('select count(*) from notifications where id=$1',[seen.id])),1);
 });
 // Further product cases are appended before this marker as workstreams land.
 await db.close();
 if(process.env.SPOTTED_PRODUCT_RESULTS)fs.writeFileSync(process.env.SPOTTED_PRODUCT_RESULTS,JSON.stringify(results,null,2));
 console.log(results.length+' product SQL checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
