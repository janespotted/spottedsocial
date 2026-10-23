import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE);
const admin='00000000-0000-0000-0000-000000000001',member='00000000-0000-0000-0000-000000000002';
const wave='10000000-0000-0000-0000-000000000001',second='10000000-0000-0000-0000-000000000002';
const migration=async name=>readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema spotted_private;grant usage on schema auth,public,spotted_private to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid,display_name text,username text);
 create table public.user_roles(user_id uuid,role text);
 create table spotted_private.night_mode_testers(user_id uuid);
 `);
 // Install the real foundational schema and phone normalizer. Unrelated
 // onboarding routines are placeholders solely for the existing rename migration.
 const base=await migration('20261010230431_nyc_onboarding_waves.sql');
 const phoneEnd=base.indexOf('$$;',base.indexOf('create function spotted_private.launch_phone'))+3;
 await db.exec(base.slice(0,phoneEnd));
 await db.exec(`create function spotted_private.save_launch_nomination(integer,text) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function spotted_private.complete_launch_onboarding() returns jsonb language sql as $$select '{}'::jsonb$$;`);
 await db.exec(await migration('20261012021331_launch_admin_center.sql'));
 await db.exec(await migration('20261022110449_requested_invites.sql'));
 await db.exec(await migration('20261022113542_request_wave_outreach.sql'));
 await db.exec(await migration('20261022115607_outreach_audit_account_deletion.sql'));
 await db.exec(await migration('20261012073319_launch_planning_pool.sql'));
 await db.exec(await migration('20261023162950_remove_from_wave.sql'));
 assert.equal((await db.query("select confdeltype from pg_constraint where conname='launch_outreach_batches_created_by_fkey'")).rows[0].confdeltype,'n');
 await db.exec(`insert into auth.users(id) values('${admin}'),('${member}');insert into spotted_private.launch_operators(user_id,wave_admin) values('${admin}',true);
 insert into spotted_private.launch_waves(id,name,capacity,status,activated_at,invitation_count) values('${wave}','The first 100',100,'draft',null,0),('${second}','Second',1,'draft',null,0);`);
 return db;
}
test('request assignment: roles, normalization, duplicates, capacity, atomic moves and protected membership',async()=>{
 const db=await setup();
 const call=async(action,data={})=>(await db.query('select public.requested_invites($1,$2) r',[action,data])).rows[0].r;
 const row=(id,phone)=>({id:id.toString().padStart(24,'0'),form_id:'6aa44b3bf24f7a00081682c2',first_name:'Test',last_name:'Person'+id,email:`test${id}@example.com`,phone,submitted_at:new Date().toISOString()});
 for(const [id,phone] of [[1,'(212) 555-0101'],[2,'+12125550101'],[3,''],[4,'+12125550104']])await db.query('select public.ingest_invite_request($1,true)',[row(id,phone)]);
 const id=n=>String(n).padStart(24,'0');
 await db.exec('set role anon');await assert.rejects(call('list'),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${member}',false)`);await assert.rejects(call('assign',{id:id(1),wave}),/Admin access/);
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
 await assert.rejects(call('assign',{id:id(3),wave}),/valid phone/);
 let g=await call('assign',{id:id(1),wave});await call('assign',{id:id(1),wave});await call('assign',{id:id(2),wave});
 let page=await call('list');assert.equal(page.waves.find(w=>w.id===wave).selected,1);assert.equal(page.rows.find(r=>r.id===id(2)).guest_id,g.guest_id);assert.equal(page.rows.find(r=>r.id===id(1)).assigned_phone,'+12125550101');
 await call('assign',{id:id(3),wave:second,phone:'+12125550103'});
 await assert.rejects(call('assign',{id:id(1),wave:second,fromWave:wave}),/capacity/);assert.equal((await call('list')).rows.find(r=>r.id===id(1)).wave_id,wave,'failed move rolls back removal');
 await assert.rejects(call('assign',{id:id(1),wave:second}),/wave changed/);
 await call('assign',{id:id(3),wave,fromWave:second});assert.equal((await call('list')).rows.find(r=>r.id===id(3)).wave_id,wave);
 await db.exec(`reset role;update spotted_private.launch_waves set status='open' where id='${second}';set role authenticated`);await assert.rejects(call('assign',{id:id(4),wave:second}),/still preparing/);
 await db.exec(`reset role;update spotted_private.launch_guests set activated_at=now() where id='${g.guest_id}';set role authenticated`);await assert.rejects(call('assign',{id:id(1),wave}),/already active/);
 await db.exec(`reset role;update auth.users set phone='+12125550104' where id='${member}';insert into spotted_private.launch_members(user_id,completed_at) values('${member}',now());set role authenticated`);await assert.rejects(call('assign',{id:id(4),wave}),/already joined/);
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from spotted_private.launch_messages')).rows[0].n,0,'assignment sends nothing');
 await db.exec(`update spotted_private.launch_operators set wave_admin=false;set role authenticated`);await assert.rejects(call('list'),/Admin access/);await db.close();
});
test('draft removal preserves contacts and sources, frees capacity, deduplicates retries and allows re-adding',async()=>{
 const db=await setup();
 const rpc=async(name,action,data={})=>(await db.query(`select public.${name}($1,$2) r`,[action,data])).rows[0].r;
 const request={id:'a'.repeat(24),form_id:'6aa44b3bf24f7a00081682c2',first_name:'Alex',last_name:'Sample',email:'alex@example.com',phone:'+12125550101',submitted_at:new Date().toISOString()};
 await db.query('select public.ingest_invite_request($1,true)',[request]);
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`);
 const g=await rpc('requested_invites','assign',{id:request.id,wave:second});
 await db.exec(`reset role;update spotted_private.launch_guests set consent_at=now(),consent_note='Asked for invitation text' where id='${g.guest_id}';
 insert into spotted_private.launch_prospects(source_key,source,name,phone,shortlisted,guest_id) values('sample','Test event','Alex Sample','+12125550101',true,'${g.guest_id}');`);
 const before=(await db.query('select * from spotted_private.launch_guests where id=$1',[g.guest_id])).rows[0];
 await db.exec('set role authenticated');
 const remove=()=>rpc('launch_admin','remove_from_wave',{wave:second,guests:[g.guest_id,g.guest_id]});
 assert.equal((await remove()).removed,1);assert.equal((await remove()).removed,0,'uncertain response retry is harmless');
 let inbox=await rpc('requested_invites','list');assert.equal(inbox.total,1);assert.equal(inbox.rows[0].guest_id,g.guest_id);assert.equal(inbox.rows[0].wave_id,null);assert.equal(inbox.waves.find(w=>w.id===second).selected,0);
 const pool=await rpc('launch_pool','list');assert.equal(pool.total,1);assert.equal(pool.rows[0].guest_id,g.guest_id);assert.equal(pool.rows[0].shortlisted,true);assert.equal(pool.rows[0].wave_name,null);
 const queue=await rpc('launch_admin','guests',{wave:'queue'});assert.equal(queue.rows[0].id,g.guest_id);assert.equal(queue.rows[0].state,'queued');
 await db.exec('reset role');assert.deepEqual((await db.query('select * from spotted_private.launch_guests where id=$1',[g.guest_id])).rows[0],{...before,wave_id:null});
 const audit=(await db.query("select details from spotted_private.launch_audit where action='remove'")).rows;assert.equal(audit.length,1);assert.equal(audit[0].details.count,1);
 await db.exec('set role authenticated');
 await rpc('launch_admin','import',{rows:[{name:'Other Sample',phone:'+12125550102'}]});
 const other=(await rpc('launch_admin','guests',{search:'+12125550102'})).rows[0];
 await rpc('launch_admin','assign',{id:second,guests:[other.id]});
 await assert.rejects(rpc('requested_invites','assign',{id:request.id,wave:second}),/capacity/);
 await rpc('launch_admin','remove_from_wave',{wave:second,guests:[other.id]});
 await rpc('requested_invites','assign',{id:request.id,wave:second});
 inbox=await rpc('requested_invites','list');assert.equal(inbox.rows[0].wave_id,second);assert.equal(inbox.rows[0].guest_id,g.guest_id);
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from spotted_private.launch_messages')).rows[0].n,0);await db.close();
});
test('draft removal rejects non-admins, stale/missing selections and mixed active members atomically',async()=>{
 const db=await setup();
 await db.exec(`insert into spotted_private.launch_guests(phone,name,source,wave_id) values('+12125550101','One','seed','${wave}'),('+12125550102','Two','seed','${wave}');`);
 const ids=(await db.query('select id from spotted_private.launch_guests order by phone')).rows.map(r=>r.id);
 const remove=data=>db.query("select public.launch_admin('remove_from_wave',$1)",[data||{wave,guests:ids}]);
 await db.exec('set role anon');await assert.rejects(remove(),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${member}',false)`);await assert.rejects(remove(),/Admin access/);
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
 for(const data of [{},null,{wave,guests:[]},{guests:ids},{wave,guests:[null]}])await assert.rejects(remove(data||{}),/Choose|Refresh/);
 await assert.rejects(remove({wave,guests:[ids[0],'99999999-0000-0000-0000-000000000000']}),/guest list changed/);
 await db.exec(`reset role;update spotted_private.launch_guests set wave_id='${second}' where id='${ids[1]}';set role authenticated`);
 await assert.rejects(remove(),/another wave/);
 await db.exec(`reset role;update spotted_private.launch_guests set wave_id='${wave}' where id='${ids[1]}';set role authenticated`);
 for(const [column,value] of [['activated_at','now()'],['invited_at','now()'],['claimed_at','now()'],['claimed_by',`'${member}'`],['revoked_at','now()']]){
  await db.exec(`reset role;update spotted_private.launch_guests set ${column}=${value} where id='${ids[1]}';set role authenticated`);
  await assert.rejects(remove(),/no people were removed/);
  await db.exec('reset role');assert.equal((await db.query('select count(*) n from spotted_private.launch_guests where wave_id=$1',[wave])).rows[0].n,2);
  await db.exec(`update spotted_private.launch_guests set ${column}=null where id='${ids[1]}';set role authenticated`);
 }
 for(const status of ['open','paused']){
  await db.exec(`reset role;update spotted_private.launch_waves set status='${status}' where id='${wave}';set role authenticated`);
  await assert.rejects(remove(),/membership history/);
 }
 await db.exec('reset role');assert.equal((await db.query("select count(*) n from spotted_private.launch_audit where action='remove'")).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from auth.users')).rows[0].n,2);await db.close();
});
test('wave outreach: exact review, stale review, consent/exclusions, batch replay, scoped claims, opt-out and delivery uncertainty',async()=>{
 const db=await setup();
 const call=async(action,data={})=>(await db.query('select public.launch_outreach($1,$2) r',[action,{wave,...data}])).rows[0].r;
 await db.exec(`insert into spotted_private.launch_guests(phone,name,source,wave_id,consent_at) select '+12125550'||lpad(n::text,3,'0'),'Guest '||n,'seed','${wave}',case when n<>3 then now() end from generate_series(1,7)n;
 update spotted_private.launch_guests set suppressed_at=now() where name='Guest 4';update spotted_private.launch_guests set invited_at=now() where name='Guest 5';update spotted_private.launch_guests set revoked_at=now() where name='Guest 6';
 insert into spotted_private.launch_messages(guest_id,body,status) select id,'prior','unknown' from spotted_private.launch_guests where name='Guest 7';
 set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);`);
 await assert.rejects(call('review'),/Admin access/);
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
 let review=await call('review');assert.equal(review.ready,2);assert.ok(review.blockers.length>=3);
 const requestId='20000000-0000-0000-0000-000000000001';await assert.rejects(call('queue',{token:review.token,requestId}),/checklist/);
 await db.exec(`reset role;update spotted_private.launch_settings set install_url='https://testflight.apple.com/j/Test123',sms_enabled=true,wave_gate=true,require_phone=true;update spotted_private.launch_waves set status='open' where id='${wave}';update spotted_private.launch_guests set activated_at=now() where wave_id='${wave}';set role authenticated;`);
 await assert.rejects(call('queue',{token:review.token,requestId}),/changed/);
 review=await call('review');assert.equal(review.blockers.length,0);const sent=await call('queue',{token:review.token,requestId});assert.equal(sent.queued,2);assert.equal((await call('queue',{token:review.token,requestId})).replayed,true);
 await assert.rejects(call('queue',{token:review.token,requestId:'20000000-0000-0000-0000-000000000002'}),/changed/);
 await assert.rejects(db.query('select * from spotted_private.launch_outreach_batches'),/permission denied/);
 await db.exec('reset role;set role service_role');
 const job=async(action,data={})=>(await db.query('select public.launch_message_job($1,$2) r',[action,data])).rows[0].r;
 assert.equal(await job('claim',{waveId:second}),null);
 let first=await job('claim',{batchId:requestId});assert.ok(first.id);assert.equal(first.body,review.message);assert.equal(first.body.includes('Test123'),true);
 await job('status',{id:first.id,status:'delivered',sid:'SM'+'a'.repeat(32)});
 await db.exec("reset role;update spotted_private.launch_guests set suppressed_at=now() where id in(select guest_id from spotted_private.launch_messages where status='queued');set role service_role");
 assert.equal(await job('claim',{batchId:requestId}),null,'opt out after queue prevents send');
 await db.exec("reset role;update spotted_private.launch_guests set suppressed_at=null where name in('Guest 1','Guest 2');set role service_role");
 let last=await job('claim',{batchId:requestId});assert.ok(last.id);assert.notEqual(last.id,first.id);assert.equal(await job('claim',{batchId:requestId}),null,'claimed message is never claimed twice');
 await job('status',{id:last.id,status:'unknown'});assert.equal(await job('claim',{batchId:requestId}),null,'unknown delivery is never automatically retried');
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`);review=await call('review');assert.equal(review.ready,0);assert.equal(review.rows.filter(r=>r.delivery==='delivered').length,1);assert.equal(review.rows.filter(r=>r.readiness.startsWith('Delivery uncertain')).length,2);
 await db.close();
});
test('100-person rehearsal: full wave queues once, interrupted run resumes only unsent guests, pause blocks claims',async()=>{
 const db=await setup();
 await db.exec(`update spotted_private.launch_settings set install_url='https://testflight.apple.com/j/Test123',sms_enabled=true,wave_gate=true,require_phone=true;
 update spotted_private.launch_waves set status='open' where id='${wave}';
 insert into spotted_private.launch_guests(phone,name,source,wave_id,consent_at,activated_at) select '+1212555'||lpad(n::text,4,'0'),'Sample '||n,'seed','${wave}',now(),now() from generate_series(1,100)n;
 set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false)`);
 const review=(await db.query("select public.launch_outreach('review',$1) r",[{wave}])).rows[0].r;assert.equal(review.ready,100);
 const batchId='30000000-0000-0000-0000-000000000001',data={wave,token:review.token,requestId:batchId};
 await db.query("select public.launch_outreach('queue',$1)",[data]);await db.query("select public.launch_outreach('queue',$1)",[data]);
 await db.exec('reset role;set role service_role');
 const claim=async()=>(await db.query("select public.launch_message_job('claim',$1) r",[{batchId}])).rows[0].r;
 const seen=new Set();
 for(let i=0;i<100;i++){
  if(i===17){await db.exec(`reset role;update spotted_private.launch_waves set status='paused' where id='${wave}';set role service_role`);assert.equal(await claim(),null);await db.exec(`reset role;update spotted_private.launch_waves set status='open' where id='${wave}';set role service_role`);}
  const job=await claim();assert.ok(job);assert.ok(!seen.has(job.to));seen.add(job.to);
  await db.query("select public.launch_message_job('status',$1)",[{id:job.id,status:'delivered',sid:'SM'+String(i).padStart(32,'0')}]);
 }
 assert.equal(await claim(),null);assert.equal(seen.size,100);
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from spotted_private.launch_messages')).rows[0].n,100);
 await db.close();
});
test('SMS provider results distinguish acceptance, delivery failure and uncertain outcomes without retries',async()=>{
 const {sendInvitation}=await import('../functions/_shared/launch-sms.mjs');
 const job={id:'test',to:'+12125550100',body:'Fictional invitation'},config={account:'test',token:'test',service:'test',callback:'https://example.com/callback'};
 let calls=0;
 const success=await sendInvitation(job,config,async(_url,options)=>{calls++;const form=new URLSearchParams(options.body);assert.equal(form.get('To'),job.to);assert.equal(form.get('Body'),job.body);return new Response(JSON.stringify({sid:'SM'+'a'.repeat(32),status:'queued'}),{status:201});});
 assert.equal(success.status,'accepted');assert.equal(calls,1);
 for(const response of [new Response('bad',{status:200}),new Response(JSON.stringify({code:500}),{status:500})])assert.equal((await sendInvitation(job,config,async()=>response)).status,'unknown');
 assert.equal((await sendInvitation(job,config,async()=>new Response(JSON.stringify({code:21610}),{status:400}))).status,'failed');
 calls=0;assert.equal((await sendInvitation(job,config,async()=>{calls++;throw Error('network');})).status,'unknown');assert.equal(calls,1);
});
