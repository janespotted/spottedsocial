import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE);
const admin='00000000-0000-0000-0000-000000000001', invited='00000000-0000-0000-0000-000000000002', waiting='00000000-0000-0000-0000-000000000003', apple='00000000-0000-0000-0000-000000000004', legacy='00000000-0000-0000-0000-000000000005';
const wave='10000000-0000-0000-0000-000000000001';
async function setup() {
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema spotted_private;
 grant usage on schema auth,public to anon,authenticated,service_role;grant usage on schema spotted_private to authenticated,service_role;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
 create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
 create table public.profiles(id uuid primary key,display_name text,username text unique,avatar_url text,city text);
 create table public.user_roles(user_id uuid,role text);create table spotted_private.night_mode_testers(user_id uuid);
 insert into auth.users(id) values('${admin}'),('${legacy}');insert into public.user_roles values('${admin}','admin');`);
 for(const name of ['20261010230431_nyc_onboarding_waves.sql','20261012021331_launch_admin_center.sql','20261022110449_requested_invites.sql','20261022113542_request_wave_outreach.sql','20261022115607_outreach_audit_account_deletion.sql','20261023060223_seamless_invite_entry.sql']) {
  await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
 }
 await db.exec(`insert into auth.users values('${invited}','12125550102',now()),('${waiting}','12125550103',now()),('${apple}',null,null);
 insert into spotted_private.launch_waves(id,name,capacity,status,activated_at,invitation_count) values('${wave}','The first 100',100,'draft',null,0);
 insert into spotted_private.launch_guests(phone,name,source,wave_id) values('+12125550102','Invited Sample','seed','${wave}');
 update spotted_private.launch_settings set wave_gate=true,require_phone=true,install_url='https://apps.apple.com/us/app/spotted/id6760576197';`);
 const user=async(id,role='authenticated')=>db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claim.role','${role}',false)`);
 const rpc=async(name,args=[])=>{
  await db.query("select set_config('request.path',$1,false)",['/rpc/'+name]);
  await db.query('select public.check_launch_request()');
  return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r;
 };
 return {db,user,rpc};
}
test('verified phone access: draft/open/paused, existing members, mandatory two unique nominations and resume',async()=>{
 const {db,user,rpc}=await setup();
 await user(invited);assert.equal((await rpc('get_launch_state')).admitted,false);
 await assert.rejects(rpc('save_launch_profile',['Jane Sample','jane_sample',true]),/not active/);
 await user(admin);await rpc('launch_admin',['open_wave',{id:wave}]);
 await user(invited);let s=await rpc('get_launch_state');assert.equal(s.admitted,true);assert.equal(s.complete,false);
 await rpc('save_launch_profile',['Jane Sample','jane_sample',true]);
 await assert.rejects(rpc('complete_launch_onboarding'),/Choose two/);
 s=await rpc('save_launch_nomination',[1,'+12125550111']);assert.equal(s.nominations.length,1);
 s=await rpc('save_launch_nomination',[1,'+12125550111']);assert.equal(s.nominations.length,1);
 assert.ok((await rpc('save_launch_nomination',[2,'+12125550111'])).error);
 await assert.rejects(rpc('complete_launch_onboarding'),/Choose two/);
 // Closing/reopening the app reads saved progress, never local completion flags.
 s=await rpc('get_launch_state');assert.equal(s.profileSaved,true);assert.equal(s.nominations.length,1);assert.equal(s.complete,false);
 await user(admin);await rpc('launch_admin',['pause_wave',{id:wave}]);
 await user(invited);assert.equal((await rpc('get_launch_state')).admitted,true,'claimed invitation survives a pause');
 await rpc('save_launch_nomination',[2,'+12125550112']);s=await rpc('complete_launch_onboarding');assert.equal(s.complete,true);
 assert.equal((await rpc('complete_launch_onboarding')).complete,true,'completion retry is idempotent');
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from spotted_private.launch_guests where nominated_by=$1',[invited])).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from spotted_private.launch_messages')).rows[0].n,0,'nominations never send invitations');
 await user(legacy);assert.equal((await rpc('get_launch_state')).complete,true,'existing account is preserved');await db.close();
});
test('uninvited request is idempotent, appears in existing inbox, respects opt-in and does not admit or send',async()=>{
 const {db,user,rpc}=await setup();await user(waiting);
 assert.equal((await rpc('get_launch_state')).accessRequested,false);
 await assert.rejects(rpc('request_launch_access',['',true]),/Add your name/);
 const first=await rpc('request_launch_access',['Waiting Sample',true]);assert.equal(first.accessRequested,true);assert.equal(first.admitted,false);
 await rpc('request_launch_access',['Waiting Sample',true]);
 await assert.rejects(rpc('requested_invites',['list',{}]),/Finish onboarding/);
 await assert.rejects(db.query('select * from spotted_private.invite_requests'),/permission denied/);
 await user(admin);const inbox=await rpc('requested_invites',['list',{}]);assert.equal(inbox.total,1);const row=inbox.rows[0];assert.equal(row.source_kind,'app');assert.equal(row.phone,'+12125550103');assert.ok(row.invitation_texts_at);
 await rpc('requested_invites',['assign',{id:row.id,wave}]);
 await db.exec('reset role');assert.equal((await db.query("select consent_at is not null opted from spotted_private.launch_guests where phone='+12125550103'")).rows[0].opted,true);
 assert.equal((await db.query('select count(*)::int n from spotted_private.launch_messages')).rows[0].n,0);
 await user(waiting);assert.equal((await rpc('get_launch_state')).admitted,false);
 await user(admin);await rpc('launch_admin',['open_wave',{id:wave}]);
 await user(waiting);assert.equal((await rpc('get_launch_state')).admitted,true);await db.close();
});
test('Apple cannot bypass verified phone; existing website requests deduplicate without importing other details',async()=>{
 const {db,user,rpc}=await setup();await user(apple);
 let s=await rpc('get_launch_state');assert.equal(s.phoneRequired,true);assert.equal(s.hasPhone,false);assert.equal(s.admitted,false);
 await assert.rejects(rpc('request_launch_access',['Apple Sample',true]),/Verify your phone/);
 await db.exec(`reset role;update auth.users set phone='12125550104',phone_confirmed_at=now() where id='${apple}';`);
 const request={id:'aaaaaaaaaaaaaaaaaaaaaaaa',form_id:'6aa44b3bf24f7a00081682c2',first_name:'Website',last_name:'Sample',email:'sample@example.com',phone:'(212) 555-0104',submitted_at:new Date().toISOString()};
 await db.query('select public.ingest_invite_request($1,true)',[request]);
 await user(apple);s=await rpc('get_launch_state');assert.equal(s.accessRequested,true);assert.equal(s.admitted,false);assert.equal(s.email,undefined);
 await rpc('request_launch_access',['Apple Sample',false]);await rpc('request_launch_access',['Apple Sample',false]);
 await user(admin);let rows=(await rpc('requested_invites',['list',{}])).rows;assert.equal(rows.length,1);assert.equal(rows[0].first_name,'Website');assert.equal(rows[0].email,'sample@example.com');assert.equal(rows[0].invitation_texts_at,null);
 await rpc('requested_invites',['assign',{id:rows[0].id,wave}]);
 await db.exec('reset role');assert.equal((await db.query("select consent_at from spotted_private.launch_guests where phone='+12125550104'")).rows[0].consent_at,null);
 await db.close();
});
test('public installation response is minimal; anonymous/waiting users cannot read private data or other APIs',async()=>{
 const {db,user,rpc}=await setup();await user('', 'anon');
 assert.deepEqual(Object.keys(await rpc('get_launch_installation')),['installUrl']);
 await assert.rejects(rpc('request_launch_access',['Anon',true]),/permission denied/);
 await assert.rejects(db.query('select spotted_private.launch_installation()'),/permission denied/);
 await user(waiting);await assert.rejects(rpc('launch_admin',['snapshot',{}]),/Finish onboarding/);
 await db.exec("reset role;update spotted_private.launch_settings set install_url=null;");await user('', 'anon');assert.equal((await rpc('get_launch_installation')).installUrl,null);
 await db.close();
});
test('batch outreach points to the entry page and still enforces setup, review freshness and idempotency',async()=>{
 const {db,user,rpc}=await setup();
 await db.exec(`update spotted_private.launch_guests set consent_at=now() where phone='+12125550102';`);
 await user(admin);
 let review=await rpc('launch_outreach',['review',{wave}]);
 assert.match(review.message,/https:\/\/spottedsocial-git-codex-nyc-onboarding-waves-spottedsocial\.vercel\.app\/join/);
 assert.ok(review.blockers.length>0);
 const requestId='40000000-0000-0000-0000-000000000001';
 await assert.rejects(rpc('launch_outreach',['queue',{wave,token:review.token,requestId}]),/checklist/);
 await rpc('launch_admin',['open_wave',{id:wave}]);
 await db.exec('reset role;update spotted_private.launch_settings set sms_enabled=true;');
 await user(admin);
 await assert.rejects(rpc('launch_outreach',['queue',{wave,token:review.token,requestId}]),/changed/);
 review=await rpc('launch_outreach',['review',{wave}]);assert.deepEqual(review.blockers,[]);
 assert.equal((await rpc('launch_outreach',['queue',{wave,token:review.token,requestId}])).queued,1);
 assert.equal((await rpc('launch_outreach',['queue',{wave,token:review.token,requestId}])).replayed,true);
 await db.exec('reset role');
 const messages=(await db.query('select body from spotted_private.launch_messages')).rows;
 assert.equal(messages.length,1);assert.equal(messages[0].body,review.message);
 await db.close();
});
