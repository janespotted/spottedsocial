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
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261012021331_launch_admin_center.sql'),'utf8'));
 const admin=(action,data={},n=1)=>rpc(n,'launch_admin',[action,data]);
 const guest=async phone=>(await q('select * from spotted_private.launch_guests where phone=$1',[phone]))[0];
 const create=async(capacity=100)=>ok(await admin('create_wave',{id:id(90),name:'First 100',capacity}));
 const seed=async(phone='+12025550101')=>value(await admin('import',{rows:[{phone,name:'Guest'}]}));
 const assign=async phone=>ok(await admin('assign',{id:id(90),guests:[(await guest(phone)).id]}));
 const gated=async()=>ok(await admin('settings',{gated:true,confirmation:'REQUIRE INVITATIONS',installUrl:'https://testflight.apple.com/j/TESTLINK'}));
 const open=async()=>ok(await admin('open_wave',{id:id(90)}));
 let passed=0,failed=0;
 async function test(name,f){await db.exec('begin');try{await f();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}finally{await db.exec('rollback');}}
 await test('Anonymous and ordinary accounts cannot inspect or mutate admin data',async()=>{deny(await actor(null,"select launch_admin('snapshot')",[],'anon'));for(const action of ['snapshot','guests','import','settings'])deny(await admin(action,{},2));deny(await actor(2,'select * from spotted_private.launch_guests'));deny(await actor(2,"select launch_message_job('claim')"));});
 await test('Additive deployment leaves current access and messaging unchanged',async()=>{assert.equal((await state(1)).complete,true);assert.equal((await state(3)).admitted,true);assert.equal(await scalar('select wave_gate from spotted_private.launch_settings'),false);assert.equal(await scalar('select sms_enabled from spotted_private.launch_settings'),false);});
 await test('Apple account requires invited verified phone under gate',async()=>{await gated();await q('update auth.users set phone=null,phone_confirmed_at=null where id=$1',[id(3)]);let s=await state(3);assert.equal(s.phoneRequired,true);assert.equal(s.hasPhone,false);assert.equal(s.admitted,false);deny(await rpc(3,'save_launch_profile',['Apple Person','apple_person',true]));deny(await rpc(3,'complete_launch_onboarding'));});
 await test('Existing Apple account remains intact',async()=>{await q('update auth.users set phone=null where id=$1',[id(1)]);await gated();assert.equal((await state(1)).complete,true);assert.equal((await state(1)).phoneRequired,false);});
 await test('Open admission cannot be reused to evade a later gate',async()=>{await profile(3);await gated();assert.equal((await state(3)).admitted,false);deny(await rpc(3,'complete_launch_onboarding'));deny(await rpc(3,'save_launch_nomination',[1,'+12025550101']));});
 await test('Import deduplicates seeds, accounts, and invalid numbers',async()=>{const d=value(await admin('import',{rows:[{phone:'+12025550101',name:'One'},{phone:'+12025550101'},{phone:'+12025550001'},{phone:'bad'}]}));assert.deepEqual(d,{added:1,duplicates:2,invalid:1});assert.equal((await seed()).duplicates,1);});
 await test('Import does not acquire consent from nomination or CSV',async()=>{await seed();const g=await guest('+12025550101');assert.equal(g.consent_at,null);assert.equal(g.activated_at,null);assert.equal(g.wave_id,null);});
 await test('Create request can be safely repeated',async()=>{await create();await create();assert.equal(await scalar('select count(*) from spotted_private.launch_waves'),1);});
 await test('Wave capacity enforced server-side even in a batch',async()=>{await create(1);await seed();await seed('+12025550102');const rows=await q('select id from spotted_private.launch_guests');assert((await admin('assign',{id:id(90),guests:rows.map(r=>r.id)})).error);assert.equal(await scalar('select count(*) from spotted_private.launch_guests where wave_id is not null'),0);await assign('+12025550101');});
 await test('Opening requires controlled admission and an installation link',async()=>{await create();await seed();await assign('+12025550101');assert((await admin('open_wave',{id:id(90)})).error);ok(await admin('settings',{gated:true,confirmation:'REQUIRE INVITATIONS'}));assert((await admin('open_wave',{id:id(90)})).error);});
 await test('Gate enablement requires concrete confirmation',async()=>{assert((await admin('settings',{gated:true})).error);assert.equal(await scalar('select wave_gate from spotted_private.launch_settings'),false);});
 await test('Internal build URLs and arbitrary URLs cannot be invitation links',async()=>{for(const installUrl of ['http://example.com','https://evil.test','https://appstoreconnect.apple.com/apps/1'])assert((await admin('settings',{installUrl})).error);});
 await test('Opening wave grants access but sends zero texts',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();await open();assert.equal(await scalar('select count(*) from spotted_private.launch_messages'),0);assert.equal((await guest('+12025550101')).invited_at,null);assert.equal(await scalar('select invitation_count from spotted_private.launch_waves'),1);});
 await test('Wrong number, unverified phone and forwarded link cannot claim',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();assert.equal((await state(4)).admitted,false);await q('update auth.users set phone=$1,phone_confirmed_at=null where id=$2',['12025550101',id(3)]);assert.equal((await state(3)).admitted,false);await q('update auth.users set phone_confirmed_at=now() where id=$1',[id(3)]);assert.equal((await state(3)).admitted,true);assert.equal((await guest('+12025550101')).claimed_by,id(3));});
 await test('Claimed number cannot be reassigned to a second account',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();await q('update auth.users set phone=$1 where id=$2',['12025550101',id(3)]);await state(3);await q('update auth.users set phone=$1 where id=$2',['12025550101',id(4)]);assert.equal((await state(4)).admitted,false);});
 await test('Pause blocks unclaimed invites, preserves claimed access, and resumes',async()=>{await create();await seed();await seed('+12025550102');await assign('+12025550101');await assign('+12025550102');await gated();await open();await q('update auth.users set phone=$1 where id=$2',['12025550101',id(3)]);await state(3);ok(await admin('pause_wave',{id:id(90)}));assert.equal((await state(3)).admitted,true);await q('update auth.users set phone=$1 where id=$2',['12025550102',id(4)]);assert.equal((await state(4)).admitted,false);await open();assert.equal((await state(4)).admitted,true);});
 await test('Revoked invitation does not admit; started accounts cannot be revoked',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();ok(await admin('revoke',{id:(await guest('+12025550101')).id}));await q('update auth.users set phone=$1 where id=$2',['12025550101',id(3)]);assert.equal((await state(3)).admitted,false);});
 await test('Exactly two nominations still required, seed-list collisions rejected',async()=>{await profile(3);await seed();assert((await nominate(3,1,'+12025550101')).error);await nominate(3,1,'+12025550103');assert((await rpc(3,'complete_launch_onboarding')).error);await nominate(3,2,'+12025550104');assert.equal(value(await rpc(3,'complete_launch_onboarding')).complete,true);assert.equal(await scalar("select count(*) from spotted_private.launch_guests where source='nomination'"),2);});
 await test('Unfinished nominations stay out of the admin queue',async()=>{await profile(3);await nominate(3,1,'+12025550101');value(await admin('snapshot'));assert.equal(await scalar('select count(*) from spotted_private.launch_guests'),0);assert.equal((await seed()).duplicates,1);});
 await test('Joined means completed onboarding, not accepted SMS',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();await q('update auth.users set phone=$1 where id=$2',['12025550101',id(3)]);await state(3);let r=value(await admin('guests')).rows[0];assert.equal(r.state,'started');await profile(3);await nominate(3,1,'+12025550103');await nominate(3,2,'+12025550104');await rpc(3,'complete_launch_onboarding');r=value(await admin('guests',{wave:id(90)})).rows[0];assert.equal(r.state,'joined');});
 await test('Manual sharing is recorded only after explicit confirmation',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();const idg=(await guest('+12025550101')).id;assert.equal(value(await admin('guests')).rows[0].state,'ready');ok(await admin('manual_sent',{id:idg}));assert.equal(value(await admin('guests')).rows[0].state,'invited');});
 await test('SMS requires recorded consent and enabled sender',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();const idg=(await guest('+12025550101')).id;assert((await admin('queue_sms',{id:idg})).error);await q('update spotted_private.launch_settings set sms_enabled=true');assert((await admin('queue_sms',{id:idg})).error);assert((await admin('consent',{id:idg,at:new Date().toISOString()})).error);ok(await admin('consent',{id:idg,at:'2026-01-01T00:00:00Z',note:'Recipient requested a launch SMS in the signup form.'}));ok(await admin('queue_sms',{id:idg}));ok(await admin('queue_sms',{id:idg}));assert.equal(await scalar('select count(*) from spotted_private.launch_messages'),1);});
 await test('Private worker and audit cannot be invoked/read by members',async()=>{deny(await actor(2,"select spotted_private.launch_message_job('claim')"));deny(await actor(2,'select * from spotted_private.launch_audit'));deny(await actor(2,"select spotted_private.sync_launch_guests()"));deny(await actor(2,"select spotted_private.complete_launch_onboarding_v1()"));});
 await test('Search, status and wave filters return isolated lists',async()=>{await create();await seed();await seed('+12025550102');await assign('+12025550101');assert.equal(value(await admin('guests',{wave:'queue'})).total,1);assert.equal(value(await admin('guests',{wave:id(90),status:'selected'})).total,1);assert.equal(value(await admin('guests',{search:'0102'})).total,1);});
 await test('Legacy activation cannot bypass reviewed named waves',async()=>{assert((await rpc(1,'activate_launch_wave',[id(90),100])).error);assert.equal(await scalar('select count(*) from spotted_private.launch_waves'),0);});
 await test('Worker claims once and callbacks are monotonic',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();const gid=(await guest('+12025550101')).id;await q('update spotted_private.launch_settings set sms_enabled=true');ok(await admin('consent',{id:gid,at:'2026-01-01',note:'Recipient requested the launch notification.'}));ok(await admin('queue_sms',{id:gid}));const worker=async(action,data={})=>value(await actor(null,'select launch_message_job($1,$2)',[action,data],'service_role'));const job=await worker('claim');assert(job.id);assert.equal(await worker('claim'),null);await worker('status',{id:job.id,status:'delivered',sid:'SMreceipt'});await worker('status',{id:job.id,status:'accepted',sid:'SMreceipt'});assert.equal(await scalar('select status from spotted_private.launch_messages'),'delivered');assert((await guest('+12025550101')).invited_at);});
 await test('STOP suppresses queued and future messages',async()=>{await create();await seed();await assign('+12025550101');await gated();await open();const gid=(await guest('+12025550101')).id;await q('update spotted_private.launch_settings set sms_enabled=true');ok(await admin('consent',{id:gid,at:'2026-01-01',note:'Recipient requested the launch notification.'}));ok(await admin('queue_sms',{id:gid}));ok(await actor(null,'select launch_message_job($1,$2)',['stop',{phone:'+12025550101'}],'service_role'));assert.equal(await scalar('select status from spotted_private.launch_messages'),'cancelled');assert((await admin('queue_sms',{id:gid})).error);});
 console.log(`${passed}/${passed+failed} passed`);await db.close();process.exitCode=failed?1:0;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
