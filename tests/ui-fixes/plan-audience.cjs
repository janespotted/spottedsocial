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
 await db.exec(fs.readFileSync(root+'/supabase/migrations/20261016112214_plan_mutual_audience.sql','utf8'));
 await db.exec(fs.readFileSync(root+'/supabase/migrations/20261016112214_plan_mutual_audience.sql','utf8'));
 const post=async(visibility='all_friends')=>(await q("insert into posts(user_id,text,visibility,expires_at) values($1,'Synthetic',$2,now()+interval '2 hours') returning id",[A,visibility]))[0].id;
 const values=visibility=>({venue_id:V,plan_date:new Date(Date.now()+86400000).toISOString().slice(0,10),plan_time:'21:00',description:'Synthetic plan',visibility});
 const save=async(visibility,participants=[],pid=null,who=A)=>{const r=await actor(who,'select save_plan($1,$2,$3::uuid[]) id',[pid,values(visibility),participants]);assert(!r.error,r.error);return r.rows[0].id;};
 const visible=async(who,pid)=>(await actor(who,'select id from plans where id=$1',[pid])).rows.length===1;
 for(const ring of ['close_friends','friends','mutual_friends'])await test(ring+' visibility: owner / close / friend / mutual / unrelated / anonymous',async()=>{
  const pid=await save(ring);
  for(const [who,expected] of [[A,true],[C,true],[F,ring!=='close_friends'],[M,ring==='mutual_friends'],[U,false],[null,false]])assert.equal(await visible(who,pid),expected,ring+': '+who);
 });
 await test('Mutual participants are accepted; unrelated participant rejects entire save',async()=>{
  const pid=await save('mutual_friends',[M]);assert.equal((await actor(M,'select user_id from plan_participants where plan_id=$1',[pid])).rows.length,1);
  const before=await scalar('select count(*) from plans');assert((await actor(A,'select save_plan(null,$1,$2::uuid[])',[values('mutual_friends'),[U]])).error);assert.equal(await scalar('select count(*) from plans'),before);
 });
 await test('Narrowing a plan removes mutual access to parent, comments, participants, notifications',async()=>{
  const pid=await save('mutual_friends',[M]);assert(!(await actor(M,"insert into plan_comments(plan_id,user_id,text) values($1,$2,'Synthetic comment')",[pid,M])).error);
  await save('close_friends',[],pid);assert.equal(await visible(M,pid),false);
  for(const table of ['plan_comments','plan_participants'])assert.equal((await actor(M,'select * from '+table+' where plan_id=$1',[pid])).rows.length,0);
  assert.equal((await actor(M,"select id from notifications where data->>'plan_id'=$1",[pid])).rows.length,0);
 });
 for(const [blocker,blocked] of [[A,M],[M,A]])await test('Block in either direction denies mutual plan and children '+blocker,async()=>{
  const pid=await save('mutual_friends',[M]);await q('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[blocker,blocked]);assert.equal(await visible(M,pid),false);assert.equal((await actor(M,'select * from plan_participants where plan_id=$1',[pid])).rows.length,0);
 });
 await test('Removing the only mutual bridge revokes access',async()=>{const pid=await save('mutual_friends');await q('delete from friendships where user_id=$1 and friend_id=$2',[BR,M]);assert.equal(await visible(M,pid),false);});
 await test('Expired plan remains owner-only before cleanup',async()=>{const pid=await save('mutual_friends');await q("update plans set expires_at=now()-interval '1 second' where id=$1",[pid]);assert.equal(await visible(M,pid),false);assert.equal(await visible(A,pid),true);});
 await test('Non-owner cannot edit and anonymous cannot save',async()=>{const pid=await save('mutual_friends');assert(denied(await actor(M,'select save_plan($1,$2)',[pid,values('friends')])));assert(denied(await actor(null,'select save_plan(null,$1)',[values('mutual_friends')])));});
 await test('Invalid audience is rejected through RPC and direct write',async()=>{assert((await actor(A,'select save_plan(null,$1)',[values('public')])).error);const pid=await save('friends');assert((await actor(A,"update plans set visibility='public' where id=$1",[pid])).error);});
 await db.close();console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
