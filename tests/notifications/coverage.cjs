const {PGlite}=require(process.env.SPOTTED_PGLITE_MODULE||'@electric-sql/pglite');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();await db.exec(fs.readFileSync(path.join(__dirname,'bootstrap.sql'),'utf8'));
 for(const name of ['20260922205151_reliable_notification_delivery','20260922213920_nightlife_notification_coverage','20260922220927_spotted_notification_voice'])await db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',name+'.sql'),'utf8'));
 const q=async sql=>(await db.query(sql)).rows;let checks=0;
 const check=async(name,sql,want)=>{assert.deepEqual(Object.values((await q(sql))[0])[0],want,name);console.log('PASS',name);checks++};
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const a=id(1),b=id(3),c=id(4),v=id(100);const expiry=new Date(Date.now()+6*3600000).toISOString();
 for(let i=1;i<=26;i++){await db.exec(`insert into profiles(id,display_name) values('${id(i)}','Friend ${i}');`);if(i>1)await db.exec(`insert into friendships(user_id,friend_id,status) values('${a}','${id(i)}','accepted');`)}
 await db.exec(`insert into notification_preferences(user_id,out_scope) values('${id(2)}','none');insert into close_friends values('${b}','${a}');insert into night_statuses(user_id,status,venue_id,venue_name,expires_at) values('${a}','out','${v}','Bar A','${expiry}');`);
 await check('first-out reaches all 24 eligible friends, not capped at 20',`select count(*)::int from notifications where type='friend_out'`,24);
 await check('first check-in does not also send a bar move',`select count(*)::int from notifications where type='friend_arrived_venue'`,0);
 await db.exec(`update night_statuses set status='home' where user_id='${a}';update night_statuses set status='out' where user_id='${a}';`);
 await check('toggling Out does not resend first-night alert',`select count(*)::int from notifications where type='friend_out'`,24);
 await db.exec(`insert into night_statuses(user_id,status,expires_at) values('${b}','planning','${expiry}');`);
 await db.exec(`update night_statuses set venue_id='${id(101)}',venue_name='Bar B' where user_id='${a}';`);
 await check('bar changes default to receiver close friends',`select count(*)::int from notifications where type='friend_arrived_venue'`,1);
 await check('bar change goes to the person who marked sender close',`select receiver_id from notifications where type='friend_arrived_venue'`,b);
 await db.exec(`update night_statuses set venue_id='${id(102)}',venue_name='Bar C' where user_id='${a}';`);
 await check('rapid bar change is throttled',`select count(*)::int from notifications where type='friend_arrived_venue'`,1);

 for(const venue of [103,104,105]) await db.exec(`update spotted_private.activity_deliveries set created_at=now()-interval '31 minutes';update night_statuses set venue_id='${id(venue)}',venue_name='Next bar' where user_id='${a}';`);
 await check('bar changes stop after three alerts per friend per night',`select count(*)::int from notifications where type='friend_arrived_venue'`,3);
 await db.exec(`delete from notifications where type='friend_out';update night_statuses set status='home' where user_id='${a}';update night_statuses set status='out' where user_id='${a}';`);
 await check('deleting inbox alerts does not reset source dedupe',`select count(*)::int from notifications where type='friend_out'`,0);
 await db.exec(`update night_statuses set status='planning' where user_id='${a}';`);
 await check('TBD originates in database without a client notifier',`select count(*)::int from notifications where type='friend_planning' and sender_id='${a}'`,24);
 await db.exec(`update night_statuses set status='home' where user_id='${a}';update night_statuses set status='planning' where user_id='${a}';`);
 await check('TBD is once per night',`select count(*)::int from notifications where type='friend_planning' and sender_id='${a}'`,24);
 await db.exec(`update night_statuses set status='out',is_private_party=true,venue_id=null,party_address='123 Secret Street' where user_id='${a}';select set_config('request.jwt.claim.sub','${a}',false);`);
 let rid=(await q(`select party_request('${a}','${b}','invite')`))[0].party_request;
 await check('host invite creates private-party notification',`select count(*)::int from notifications where type='private_party_invite'`,1);
 await db.exec(`select party_request('${a}','${b}','invite');`);
 await check('repeated invite is idempotent',`select count(*)::int from notifications where type='private_party_invite'`,1);
 await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);select respond_party_request('${rid}',true);`);
 await check('acceptance notifies the host',`select count(*)::int from notifications where type='party_invite_accepted'`,1);
 await check('accepting invite does not automatically grant address',`select approved_party_address('${a}')`,null);
 rid=(await q(`select party_request('${a}','${b}','address')`))[0].party_request;
 await check('guest request notifies host',`select count(*)::int from notifications where type='address_request'`,1);
 await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);select respond_party_request('${rid}',true);`);
 await check('address approval creates generic notification',`select count(*)::int from notifications where type='party_address_approved'`,1);
 await check('address is absent from all push payloads',`select count(*)::int from notifications where message like '%Secret Street%' or data::text like '%Secret Street%'`,0);
 await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
 await check('approved guest can retrieve address inside app',`select approved_party_address('${a}')`,'123 Secret Street');
 await db.exec(`select set_config('request.jwt.claim.sub','${c}',false);`);
 await check('other friend cannot read approved address',`select approved_party_address('${a}')`,null);
 await assert.rejects(db.exec(`select respond_party_request('${rid}',true)`));checks++;
 await db.exec(`insert into blocked_users values('${a}','${b}');select set_config('request.jwt.claim.sub','${b}',false);`);
 await check('blocking revokes address access',`select approved_party_address('${a}')`,null);
 await db.exec(`delete from blocked_users;update night_statuses set is_private_party=false where user_id='${a}';`);
 await check('ending party revokes address access',`select approved_party_address('${a}')`,null);
 await check('ending party suppresses queued approval alert',`select push_notification_allowed(id) from notifications where type='party_address_approved'`,false);
 await check('clients cannot insert or approve requests directly',`select has_table_privilege('authenticated','party_requests','INSERT') or has_table_privilege('authenticated','party_requests','UPDATE')`,false);
 await check('clients cannot call internal notification RPC bypass',`select has_function_privilege('authenticated','public.create_notification_core(uuid,text,text)','EXECUTE')`,false);
 await check('anonymous users cannot request an address',`select has_function_privilege('anon','public.party_request(uuid,uuid,text)','EXECUTE')`,false);
 // A new night starting at a private party still emits generic first-Out.
 await db.exec(`update night_statuses set is_private_party=true,expires_at='${new Date(Date.parse(expiry)+86400000).toISOString()}' where user_id='${a}';`);
 await check('private-party first-Out sends without a venue',`select count(*)::int from notifications where type='friend_out'`,24);

 await check('old party approval cannot carry into restarted party',`select approved_party_address('${a}')`,null);
 await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);select * from create_notification('${b}','friend_out','forged');`);
 await check('legacy status helper does not duplicate database alert',`select count(*)::int from notifications where type='friend_out'`,24);
 await db.exec(`insert into profiles(id,display_name) values('${id(50)}','New friend');insert into friendships(user_id,friend_id,status) values('${a}','${id(50)}','pending');select * from create_notification('${id(50)}','friend_request','duplicate');`);
 await check('friend request is transactional and legacy calls do not duplicate',`select count(*)::int from notifications where type='friend_request' and receiver_id='${id(50)}'`,1);
 await db.exec(`update profiles set location_sharing_level='close_friends' where id='${a}';`);
 await check('audience tightening cancels queued out alert',`select push_notification_allowed(id) from notifications where type='friend_out' and receiver_id='${c}'`,false);

 await check('generic out alert does not expose a venue ID',`select count(*)::int from notifications where type='friend_out' and data->>'venue_id' is not null`,0);
 await db.exec(`update night_statuses set status='home' where user_id='${b}';`);
 await check('staying in suppresses previously queued bar location',`select push_notification_allowed(id) from notifications where type='friend_arrived_venue' limit 1`,false);

 await db.exec(`insert into profiles(id,display_name) values('${id(60)}','Mutual');insert into friendships(user_id,friend_id,status) values('${b}','${id(60)}','accepted');update profiles set location_sharing_level='mutual_friends' where id='${a}';update night_statuses set expires_at='${new Date(Date.parse(expiry)+2*86400000).toISOString()}' where user_id='${a}';`);
 await check('Friends + Mutuals first-out includes an eligible second-degree friend',`select count(*)::int from notifications where type='friend_out' and receiver_id='${id(60)}'`,1);
 await db.exec(`insert into location_hidden values('${a}','${id(60)}');`);
 await check('hidden mutual cannot receive queued first-out',`select push_notification_allowed(id) from notifications where type='friend_out' and receiver_id='${id(60)}'`,false);
 console.log(`${checks} nightlife checks passed`);await db.close();
})().catch(e=>{console.error(e.message,e.position,e.internalQuery,e.where);process.exitCode=1});
