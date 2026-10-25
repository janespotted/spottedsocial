// Isolated PostgreSQL. Synthetic accounts only; no network or hosted writes.
const { PGlite } = require(process.env.SPOTTED_PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async () => {
 const db = new PGlite();
 const q = async (s,a=[]) => (await db.query(s,a)).rows;
 const scalar = async(s,a=[]) => Object.values((await q(s,a))[0])[0];
 for(const f of ['audited-schema.sql','audited-storage.sql']) await db.exec(fs.readFileSync(path.join(root,'tests/privacy',f),'utf8'));
 await db.exec('alter table auth.users add column phone text, add column phone_confirmed_at timestamptz; create publication supabase_realtime');
 for(const f of fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.startsWith('202609222')||n.includes('_v1_')||/^2026100[567]/.test(n)).sort()) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8'));
 await q("select set_config('request.jwt.claim.role','service_role',false)");
 async function user(n,phone=null) {
  await q('insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,now())',[id(n),phone]);
  await q("insert into profiles(id,display_name,username,city) values($1,$2,$3,'nyc')",[id(n),'Test '+n,'test'+n]);
 }
 await user(1,'12025550001'); await user(2,'12025550002');
 await q("insert into spotted_private.night_mode_testers(user_id,note) values($1,'Test')",[id(1)]);
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261010230431_nyc_onboarding_waves.sql'),'utf8'));
 for(let n=3;n<=10;n++) await user(n,'1202555'+String(n).padStart(4,'0'));
 await q('insert into spotted_private.launch_operators(user_id,city_tester,wave_admin) values($1,true,true) on conflict(user_id) do update set wave_admin=true',[id(1)]);
 async function actor(n,sql,args=[],role='authenticated') {
  await db.exec('savepoint actor');
  await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[n?id(n):'',role]);
  await db.exec('set local role '+role);
  try { const rows=await q(sql,args);await db.exec('reset role');return {rows}; }
  catch(e){await db.exec('rollback to actor');return {error:e.message,code:e.code,rows:[]};}
 }
 const ok=r=>{assert(!r.error,r.error);return r.rows;};
 const value=r=>Object.values(ok(r)[0])[0];
 const deny=r=>assert(r.code==='42501'||(!r.error&&!r.rows.length),JSON.stringify(r));
 const rpc=(n,name,args=[])=>actor(n,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args);
 const state=async n=>value(await rpc(n,'get_launch_state'));
 const profile=async n=>{await state(n);return value(await rpc(n,'save_launch_profile',['Person '+n,'person'+n,true]));};
 const nominate=async(n,slot,phone)=>value(await rpc(n,'save_launch_nomination',[slot,phone]));
 const pair=async n=>{await profile(n);await nominate(n,1,'+12025550101');await nominate(n,2,'+12025550102');};
 let passed=0,failed=0;
 async function test(name,f){await db.exec('begin');try{await f();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}finally{await db.exec('rollback');}}
 await test('Existing accounts keep access without nominations',async()=>{assert.equal((await state(1)).complete,true);assert.equal(await scalar('select count(*) from spotted_private.launch_nominations'),0);});
 await test('New profiles require two nominations even with gate off',async()=>{const s=await profile(3);assert.equal(s.admitted,true);assert.equal(s.complete,false);assert.equal((await rpc(3,'complete_launch_onboarding')).code,'22023');await nominate(3,1,'+12025550101');assert.equal((await rpc(3,'complete_launch_onboarding')).code,'22023');});
 await test('Exactly two distinct saved numbers unlock; retries are idempotent',async()=>{await pair(3);assert.equal(value(await rpc(3,'complete_launch_onboarding')).complete,true);assert.equal(value(await rpc(3,'complete_launch_onboarding')).complete,true);assert.equal(await scalar('select count(*) from spotted_private.launch_nominations'),2);assert.equal(await scalar('select count(*) from friendships'),0);});
 await test('Duplicate account, self, same pair and another nominator are rejected',async()=>{await profile(3);await profile(4);for(const phone of ['+12025550002','+12025550003'])assert((await nominate(3,1,phone)).error);await nominate(3,1,'+12025550101');assert((await nominate(3,2,'+12025550101')).error);assert((await nominate(4,1,'+12025550101')).error);assert.equal((await nominate(3,1,'+12025550101')).nominations.length,1);});
 await test('Selections survive server reload and can be replaced',async()=>{await pair(3);await nominate(3,1,'+12025550103');assert.deepEqual((await state(3)).nominations.map(n=>n.phone),['+12025550103','+12025550102']);assert.equal(await scalar("select count(*) from spotted_private.launch_nominations where phone='+12025550101'"),0);});
 await test('Completed nominations cannot be silently replaced',async()=>{await pair(3);await rpc(3,'complete_launch_onboarding');deny(await rpc(3,'save_launch_nomination',[1,'+12025550103']));});
 await test('Names, usernames, terms and invalid numbers validate on server',async()=>{await state(3);for(const args of [[' ','good',true],['Jane','admin',true],['Jane','bad!',true],['Jane','valid',false]])assert.equal((await rpc(3,'save_launch_profile',args)).code,'22023');await profile(3);for(const phone of ['123','++12025550101','+02025550101'])assert((await nominate(3,1,phone)).error);assert((await nominate(3,3,'+12025550101')).error);});
 await test('Recheck someone registering while choices are in progress',async()=>{await pair(3);await q('update auth.users set phone=$1 where id=$2',['12025550101',id(4)]);assert(value(await rpc(3,'complete_launch_onboarding')).error);assert.equal((await state(3)).complete,false);});
 await test('Phone checks are rate limited without rolling back counters',async()=>{await profile(3);for(let i=0;i<30;i++)await nominate(3,1,'+12025550002');assert.match((await nominate(3,1,'+12025550101')).error,/Too many/);});
 await test('Waitlisted, unauthenticated and missing identity cannot nominate',async()=>{await q('update spotted_private.launch_settings set wave_gate=true');assert.equal((await state(3)).admitted,false);deny(await rpc(3,'save_launch_nomination',[1,'+12025550101']));deny(await actor(null,'select get_launch_state()',[],'anon'));deny(await rpc(null,'get_launch_state'));});
 await test('Direct private table access and public data blocked while incomplete',async()=>{await profile(3);deny(await actor(3,'select * from spotted_private.launch_nominations'));deny(await actor(3,'select * from profiles'));deny(await actor(3,'select * from invite_codes'));deny(await actor(3,'select * from storage.objects'));});
 await test('Legacy RPC and link routes blocked by request hook',async()=>{await profile(3);for(const route of ['/rpc/redeem_invite_code','/rpc/get_night_recap','/profiles','']){await q("select set_config('request.path',$1,true)",[route]);deny(await rpc(3,'check_launch_request'));}await q("select set_config('request.path','/rpc/get_launch_state',true)");ok(await rpc(3,'check_launch_request'));});
 await test('Ordinary members cannot change city or manage waves',async()=>{deny(await actor(2,"update profiles set city='la' where id=$1 returning id",[id(2)]));deny(await rpc(2,'get_launch_dashboard'));deny(await rpc(2,'activate_launch_wave',[id(90),100]));});
 await test('Trusted city tester can use LA and correct timezone',async()=>{ok(await actor(1,"update profiles set city='la' where id=$1 returning id",[id(1)]));assert.equal(await scalar('select city from profiles where id=$1',[id(1)]),'la');assert.equal(await scalar("select spotted_private.city_tz('la')"),'America/Los_Angeles');});
 await test('Activation excludes unfinished nominations and enforces requested batch',async()=>{await pair(3);await profile(4);await nominate(4,1,'+12025550103');await rpc(3,'complete_launch_onboarding');await q('update spotted_private.launch_settings set wave_gate=true');const d=value(await rpc(1,'activate_launch_wave',[id(90),1]));assert.equal(d.activated,1);assert.equal(d.pending,1);await rpc(1,'activate_launch_wave',[id(90),1]);assert.equal(await scalar('select count(*) from spotted_private.launch_waves'),1);assert.equal(await scalar('select count(*) from spotted_private.launch_nominations where wave_id is not null'),1);});
 await test('Verified nominee claims one place; forwarded URL and unverified phone cannot',async()=>{await pair(3);await rpc(3,'complete_launch_onboarding');await q('update spotted_private.launch_settings set wave_gate=true');await rpc(1,'activate_launch_wave',[id(90),2]);await q('update auth.users set phone=$1,phone_confirmed_at=null where id=$2',['12025550101',id(4)]);assert.equal((await state(4)).admitted,false);assert.equal((await state(5)).admitted,false);await q('update auth.users set phone_confirmed_at=now() where id=$1',[id(4)]);assert.equal((await state(4)).admitted,true);assert.equal((await state(4)).complete,false);assert.equal(await scalar('select count(*) from spotted_private.launch_nominations where claimed_by=$1',[id(4)]),1);});
 console.log(`${passed}/${passed+failed} passed`);await db.close();process.exitCode=failed?1:0;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
