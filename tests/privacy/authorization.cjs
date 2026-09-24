// Production-shaped, synthetic-only regression. Never run audited-schema.sql on a live project.
const {PGlite}=require(process.env.SPOTTED_PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [J,C,F,M,U,B,BR]=[1,2,3,4,5,6,7].map(id),P=id(100),V=id(200);
const results=[];
async function run(fixed){
 const db=new PGlite();await db.exec(fs.readFileSync(path.join(__dirname,'audited-schema.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'audited-storage.sql'),'utf8'));
 for(const n of fs.readdirSync(root+'/supabase/migrations').filter(n=>n.startsWith('202609222')))await db.exec(fs.readFileSync(root+'/supabase/migrations/'+n,'utf8'));
 if(fixed)for(const n of fs.readdirSync(root+'/supabase/migrations').filter(n=>n.endsWith('_v1_privacy_authorization.sql')||n.endsWith('_v1_private_media.sql')))await db.exec(fs.readFileSync(root+'/supabase/migrations/'+n,'utf8'));
 const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const scalar=async(sql,args=[])=>Object.values((await query(sql,args))[0]||{})[0];
 async function as(user,sql,args=[]){
  await db.exec('savepoint actor');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);await db.exec('set local role '+(user?'authenticated':'anon'));
  try{const rows=await query(sql,args);await db.exec('rollback to actor');return{rows,denied:false};}
  catch(e){await db.exec('rollback to actor');return{rows:[],denied:true,error:e.message};}
 }
 // Persistent actor operations need to retain their writes within the outer case.
 async function writeAs(user,sql,args=[]){
  await db.exec('savepoint actor');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await db.exec('set local role authenticated');
  try{const rows=await query(sql,args);await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',true)");return{rows,denied:false};}
  catch(e){await db.exec('rollback to actor');return{rows:[],denied:true,error:e.message};}
 }
 for(const u of [J,C,F,M,U,B,BR]){await db.query('insert into auth.users(id) values($1)',[u]);await db.query("insert into profiles(id,display_name,city) values($1,'Synthetic','nyc')",[u]);}
 for(const u of [C,F,B,BR])await db.query("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')",[J,u]);
 await db.query("insert into friendships(user_id,friend_id,status) values($1,$2,'accepted')",[BR,M]);
 await db.query('insert into close_friends(user_id,close_friend_id) values($1,$2)',[J,C]);
 await db.query("insert into venues(id,name,city,lat,lng,is_demo,neighborhood,type) values($1,'Synthetic venue','nyc',40.7,-74,false,'Test','bar')",[V]);
 await db.query("insert into night_statuses(user_id,status,venue_id,venue_name,lat,lng,expires_at) values($1,'out',$2,'Synthetic venue',40.7,-74,now()+interval '2 hours')",[J,V]);
 await db.query('update profiles set is_out=true,last_known_lat=40.7,last_known_lng=-74,last_location_at=now() where id=$1',[J]);
 await db.query("insert into posts(id,user_id,text,visibility,expires_at) values($1,$2,'Close-only content','close_friends',now()+interval '2 hours')",[P,J]);
 async function test(name,fn,before=false){await db.exec('begin');try{const actual=await fn();const expected=fixed?true:before;results.push({name,mode:fixed?'corrected':'audited',protected:actual,expected});assert.equal(actual,expected,name);}finally{await db.exec('rollback');}}
 const object=J+'/post.jpg';
 await db.query("insert into storage.objects(bucket_id,name) values('post-images',$1)",[object]);
 const mediaAllowed=async(user,path=object,playback=null)=> {
  if(!fixed)return await scalar("select public from storage.buckets where id='post-images'");
  const x=await as(user,'select private_media_target($1,$2) target',[path,playback]);
  if(x.denied)throw Error(x.error);return x.rows[0]?.target!==null;
 };
 const deniedRows=r=>r.denied||r.rows.length===0;
 const gpsHidden=async u=>{const x=await as(u,'select last_known_lat from get_profiles_safe() where id=$1',[J]);return x.denied||x.rows.length===0||x.rows[0].last_known_lat===null;};
 await test('forged accepted friendship denied',async()=>{const r=await writeAs(U,"insert into friendships(user_id,friend_id,status) values($1,$2,'accepted') returning id",[U,J]);return r.denied;});
 await test('requester cannot self-accept',async()=>{await db.query("insert into friendships(user_id,friend_id,status) values($1,$2,'pending')",[U,J]);return(await writeAs(U,"update friendships set status='accepted' where user_id=$1 and friend_id=$2 returning id",[U,J])).denied;});
 await test('valid request and recipient acceptance work',async()=>{const a=await writeAs(U,"insert into friendships(user_id,friend_id,status) values($1,$2,'pending') returning id",[U,J]);const b=await writeAs(J,"update friendships set status='accepted' where id=$1 returning id",[a.rows[0]?.id]);return !a.denied&&!b.denied&&b.rows.length===1;},true);
 await test('friendship endpoints cannot be reassigned',async()=>{return (await writeAs(F,'update friendships set user_id=$1,friend_id=$2 where user_id=$3 and friend_id=$4 returning id',[F,U,J,F])).denied;});
 await test('removed friend loses residual Close Friends authorization',async()=>{await db.query("update profiles set location_sharing_level='close_friends' where id=$1",[J]);await writeAs(C,'delete from friendships where (user_id=$1 and friend_id=$2) or (user_id=$2 and friend_id=$1)',[J,C]);return await gpsHidden(C);});
 await test('Close Friends post inaccessible to normal friend',async()=>deniedRows(await as(F,'select text from posts where id=$1',[P])));
 await test('Close Friends post remains accessible to authorized close friend',async()=>{const x=await as(C,'select text from posts where id=$1',[P]);return !x.denied&&x.rows.length===1;},true);
 await test('blocked user cannot read protected post',async()=>{await db.query('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[J,B]);return deniedRows(await as(B,'select text from posts where id=$1',[P]));});
 await test('blocked user cannot obtain GPS',async()=>{await db.query('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[J,B]);return await gpsHidden(B);},true);
 await test('eligible actual mutual can read mutual audience post',async()=>{await db.query("update posts set visibility='mutual_friends' where id=$1",[P]);return (await as(M,'select text from posts where id=$1',[P])).rows.length===1;});
 await test('mutual audience still rejects unrelated viewer',async()=>{await db.query("update posts set visibility='mutual_friends' where id=$1",[P]);return deniedRows(await as(U,'select text from posts where id=$1',[P]));},true);
 for(const status of ['planning','home','off'])await test(status+' state cannot expose residual GPS',async()=>{await db.query('update night_statuses set status=$1 where user_id=$2',[status,J]);return await gpsHidden(F);});
 await test('expired state cannot expose GPS',async()=>{await db.query("update night_statuses set expires_at=now() where user_id=$1",[J]);return await gpsHidden(F);});
 await test('authorized current-night last-known GPS retains its capture timestamp',async()=>{await db.query("update profiles set last_location_at=now()-interval '20 minutes' where id=$1",[J]);const x=await as(F,'select last_known_lat,last_location_at from get_profiles_safe() where id=$1',[J]);return x.rows[0]?.last_known_lat===40.7&&x.rows[0]?.last_location_at!==null;},true);
 await test('location hiding denies precise GPS',async()=>{await db.query('insert into location_hidden(user_id,hidden_from_id) values($1,$2)',[J,F]);return await gpsHidden(F);},true);
 await test('planning-specific audience is authoritative',async()=>{await db.query("update night_statuses set status='planning',planning_visibility='close_friends',planning_neighborhood='Private neighborhood' where user_id=$1",[J]);return deniedRows(await as(F,'select planning_neighborhood from night_statuses where user_id=$1',[J]));});

 await test('planning alert creation obeys planning audience, with Close Friend positive control',async()=>{
   await db.query("update night_statuses set status='planning',planning_visibility='close_friends' where user_id=$1",[J]);
   return await scalar("select count(*)::int from notifications where type='friend_planning' and sender_id=$1 and receiver_id=$2",[J,F])===0 && await scalar("select count(*)::int from notifications where type='friend_planning' and sender_id=$1 and receiver_id=$2",[J,C])===1;
 });
 await test('tightening planning audience cancels an already queued planning push',async()=>{
   await db.query("update night_statuses set status='planning',planning_visibility='all_friends' where user_id=$1",[J]);
   await db.query("update night_statuses set planning_visibility='close_friends' where user_id=$1",[J]);
   return await scalar("select push_notification_allowed(id) from notifications where type='friend_planning' and sender_id=$1 and receiver_id=$2",[J,F])===false;
 });
 await test('raw status coordinates cannot bypass safe projection',async()=>deniedRows(await as(F,'select lat,lng from night_statuses where user_id=$1',[J])));
 await test('expired post is unreadable before cleanup',async()=>{await db.query('update posts set expires_at=now() where id=$1',[P]);return deniedRows(await as(C,'select text from posts where id=$1',[P]));});
 await test('private-party raw address denied',async()=>{await db.query("update night_statuses set is_private_party=true,party_address='Synthetic private address' where user_id=$1",[J]);return deniedRows(await as(F,'select party_address from night_statuses where user_id=$1',[J]));});
 await test('party address cannot bypass column grants via row JSON',async()=>{await db.query("update night_statuses set is_private_party=true,party_address='Synthetic private address' where user_id=$1",[J]);return deniedRows(await as(F,'select to_jsonb(s) from night_statuses s where user_id=$1',[J]));});
 await test('legacy party RPC requires explicit address approval',async()=>{await db.query("update night_statuses set is_private_party=true,party_address='Synthetic private address' where user_id=$1",[J]);await db.query("insert into notifications(sender_id,receiver_id,type,message) values($1,$2,'private_party_invite','Invitation')",[J,F]);const x=await as(F,'select get_party_address($1) address',[J]);return x.denied||x.rows[0]?.address===null;});
 await test('direct DM cannot resolve to an existing group',async()=>{const g=await writeAs(J,"select create_group_thread('Group',array[$1,$2]::uuid[]) id",[F,U]);const d=await writeAs(J,'select create_dm_thread($1) id',[F]);return !g.denied&&!d.denied&&g.rows[0].id!==d.rows[0].id;});
 await test('direct DM is reused in either direction with exactly two members',async()=>{const a=await writeAs(J,'select create_dm_thread($1) id',[F]);const b=await writeAs(F,'select create_dm_thread($1) id',[J]);return a.rows[0]?.id===b.rows[0]?.id&&await scalar('select count(*)::int from dm_thread_members where thread_id=$1',[a.rows[0].id])===2;},true);


 await test('client-owned fake demo post cannot escape its audience',async()=>{
   await db.query('update posts set is_demo=true where id=$1',[P]);return deniedRows(await as(U,'select text from posts where id=$1',[P]));
 });
 await test('old check-in history is hidden from other viewers',async()=>{
   await db.query("insert into checkins(user_id,venue_name,lat,lng,started_at) values($1,'Old venue',40.7,-74,now()-interval '40 days')",[J]);
   return deniedRows(await as(F,'select venue_name from checkins where user_id=$1',[J]));
 });

 await test('hidden post comments cannot be retrieved through their own table',async()=>{
   await db.query("insert into post_comments(post_id,user_id,text) values($1,$2,'Secret comment')",[P,J]);
   return deniedRows(await as(F,'select text from post_comments where post_id=$1',[P]));
 });
 await test('Home status metadata is hidden from other accounts',async()=>{
   await db.query("update night_statuses set status='home' where user_id=$1",[J]);
   return deniedRows(await as(F,'select venue_name from night_statuses where user_id=$1',[J]));
 });
 await test('a mislabeled non-group thread with a third member is not a direct conversation',async()=>{
   const g=await writeAs(J,"select create_group_thread('Legacy',array[$1,$2]::uuid[]) id",[F,U]);
   await db.query('update dm_threads set is_group=false where id=$1',[g.rows[0].id]);
   return (await writeAs(J,'select create_dm_thread($1) id',[F])).rows[0]?.id!==g.rows[0].id;
 });

 await test('expired private-party pin is denied even while status remains active',async()=>{
   await db.query('update night_statuses set is_private_party=true where user_id=$1',[J]);
   await db.query('update party_locations set expires_at=now() where user_id=$1',[J]);
   return deniedRows(await as(C,'select lat,lng from party_locations where user_id=$1',[J]));
 });
 await test('restarted party with no fresh pin cannot reuse old precise location',async()=>{
   await db.query('update night_statuses set is_private_party=true where user_id=$1',[J]);
   await db.query("update night_statuses set updated_at=now()+interval '1 second' where user_id=$1",[J]);
   return deniedRows(await as(C,'select lat,lng from party_locations where user_id=$1',[J]));
 });
 await test('current private-party pin remains visible to a Close Friend',async()=>{
   await db.query('update night_statuses set is_private_party=true where user_id=$1',[J]);
   return (await as(C,'select lat,lng from party_locations where user_id=$1',[J])).rows[0]?.lat===40.7;
 },true);
 await test('raw Storage object metadata/download authorization denied',async()=>deniedRows(await as(U,"select * from storage.objects where bucket_id='post-images' and name=$1",[object])));
 await test('anonymous Storage object retrieval authorization is denied',async()=>deniedRows(await as(null,"select * from storage.objects where bucket_id='post-images' and name=$1",[object])));
 await test('post-images public URL contract is disabled',async()=>!(await scalar("select public from storage.buckets where id='post-images'")));
 await test('parked yap public URL contract is disabled',async()=>!(await scalar("select public from storage.buckets where id='yap-media'")));
 await test('unrelated viewer cannot retrieve private post image',async()=>{await db.query('update posts set image_url=$1 where id=$2',[object,P]);return !await mediaAllowed(U);});
 await test('normal friend cannot retrieve Close Friends media',async()=>{await db.query('update posts set image_url=$1 where id=$2',[object,P]);return !await mediaAllowed(F);});
 await test('actual close friend can retrieve current post image',async()=>{await db.query('update posts set image_url=$1 where id=$2',[object,P]);return await mediaAllowed(C);},true);
 await test('blocked close friend cannot retrieve private media',async()=>{await db.query('update posts set image_url=$1 where id=$2',[object,P]);await db.query('insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[J,C]);return !await mediaAllowed(C);});
 await test('post expiry denies others before physical object deletion',async()=>{await db.query('update posts set image_url=$1,expires_at=now() where id=$2',[object,P]);return !await mediaAllowed(C);});
 await test('expired retained photo remains available only to owner recap',async()=>{await db.query('update posts set image_url=$1,expires_at=now() where id=$2',[object,P]);return await mediaAllowed(J);},true);
 await test('deleted post object cannot be retrieved',async()=>{await db.query('update posts set image_url=$1 where id=$2',[object,P]);await db.query('delete from posts where id=$1',[P]);return !await mediaAllowed(C);});
 await test('foreign media path cannot be laundered through an owned post',async()=>{const r=await writeAs(U,"insert into posts(user_id,text,image_url,expires_at) values($1,'Copied path',$2,now()+interval '1 hour') returning id",[U,object]);return r.denied;});
 await test('foreign media path cannot be laundered through a DM',async()=>{const t=await writeAs(U,'select create_dm_thread($1) id',[F]);const r=await writeAs(U,"insert into dm_messages(thread_id,sender_id,text,image_url) values($1,$2,'Copied path',$3) returning id",[t.rows[0].id,U,object]);return r.denied;});
 await test('raw check-in GPS cannot bypass safe projection',async()=>{await db.query("insert into checkins(user_id,venue_name,lat,lng) values($1,'Test',40.7,-74)",[J]);return deniedRows(await as(F,'select lat,lng from checkins where user_id=$1',[J]));});
 await test('previous-night precise location is not current sharing',async()=>{await db.query("update profiles set last_location_at=now()-interval '30 hours' where id=$1",[J]);return await gpsHidden(F);});
 if(fixed){
  await test('remove and one-use bounded Undo preserve original consent',async()=>{const t=await writeAs(J,'select remove_friendship($1) token',[F]);assert(!t.denied,t.error);assert(await gpsHidden(F));const restored=await writeAs(J,'select restore_friendship($1)',[t.rows[0].token]);assert(!restored.denied,restored.error);const reused=await writeAs(J,'select restore_friendship($1)',[t.rows[0].token]);return !restored.denied&&reused.denied&&!await gpsHidden(F);});
  await test('block/unblock cannot resurrect old close consent or Undo',async()=>{const t=await writeAs(J,'select remove_friendship($1) token',[C]);await writeAs(J,'insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[J,C]);await writeAs(J,'delete from blocked_users where blocker_id=$1 and blocked_id=$2',[J,C]);const restore=await writeAs(J,'select restore_friendship($1)',[t.rows[0].token]);return restore.denied&&await gpsHidden(C);});
  await test('private-party invite acceptance and address approval remain distinct',async()=>{await db.query("update night_statuses set is_private_party=true,party_address='Synthetic approved address' where user_id=$1",[J]);const inv=await writeAs(J,"select party_request($1,$2,'invite') id",[J,F]);assert(!inv.denied,inv.error);await writeAs(F,'select respond_party_request($1,true)',[inv.rows[0].id]);assert.equal((await as(F,'select get_party_address($1) a',[J])).rows[0].a,null);const req=await writeAs(F,"select party_request($1,$2,'address') id",[J,F]);await writeAs(J,'select respond_party_request($1,true)',[req.rows[0].id]);return(await as(F,'select get_party_address($1) a',[J])).rows[0].a==='Synthetic approved address';});
  await test('clients cannot turn themselves into trusted demo identities',async()=>(await writeAs(U,'update profiles set is_demo=true where id=$1 returning id',[U])).denied);
  await test('DM media requires current thread membership and expires nightly',async()=>{
    const t=await writeAs(J,'select create_dm_thread($1) id',[F]);
    const r=await writeAs(J,"insert into dm_messages(thread_id,sender_id,text,image_url) values($1,$2,'Photo',$3) returning id",[t.rows[0].id,J,object]);assert(!r.denied,r.error);
    assert(await mediaAllowed(F));assert(!await mediaAllowed(U));
    await db.query("update dm_messages set created_at=now()-interval '30 hours' where id=$1",[r.rows[0].id]);return !await mediaAllowed(F);
  });
  await test('deletion queues nested object and retry queue excludes live references',async()=>{
    await db.query('update posts set image_url=$1 where id=$2',[object,P]);await db.query('delete from posts where id=$1',[P]);
    const q=await query('select * from pending_private_media_cleanup()');return q.some(r=>r.name===object);
  });
  await test('account deletion actually deletes profile and queues nested DM objects',async()=>{
    await db.query('delete from profiles where id=$1',[J]);
    return await scalar('select count(*)::int from profiles where id=$1',[J])===0 && await scalar('select count(*)::int from media_object_deletions where name=$1',[object])===1;
  });
  await test('early signed Mux completion is bound to uploader and survives later post insert',async()=>{
    await db.query("insert into mux_uploads(upload_id,user_id,asset_id,playback_id,status) values('upload', $1,'asset','signed-id','ready')",[J]);
    assert((await writeAs(U,"insert into posts(user_id,text,mux_upload_id,expires_at) values($1,'Steal','upload',now()+interval '1 hour')",[U])).denied);
    const r=await writeAs(J,"insert into posts(user_id,text,mux_upload_id,visibility,expires_at) values($1,'Video','upload','close_friends',now()+interval '1 hour') returning mux_playback_id,mux_signed",[J]);
    assert(!r.denied,r.error);assert.equal(r.rows[0].mux_playback_id,'signed-id');assert.equal(r.rows[0].mux_signed,true);
    return await mediaAllowed(C,null,'signed-id')&&!await mediaAllowed(F,null,'signed-id');
  });

  await test('approved party address is revoked after blocking',async()=>{
    await db.query("update night_statuses set is_private_party=true,party_address='Secret' where user_id=$1",[J]);
    const req=await writeAs(C,"select party_request($1,$2,'address') id",[J,C]);assert(!req.denied,req.error);
    await writeAs(J,'select respond_party_request($1,true)',[req.rows[0].id]);
    assert.equal((await as(C,'select get_party_address($1) a',[J])).rows[0].a,'Secret');
    await writeAs(C,'insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[C,J]);
    assert.equal((await as(C,'select get_party_address($1) a',[J])).rows[0].a,null);
    return true;
  });
  await test('blocked caller cannot create pending friendship or resolve direct DM',async()=>{
    await writeAs(J,'insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[J,U]);
    return (await writeAs(U,"insert into friendships(user_id,friend_id) values($1,$2)",[U,J])).denied && (await writeAs(U,'select create_dm_thread($1)',[J])).denied;
  });
  await test('group avatar remains private to current group members',async()=>{
    const t=await writeAs(J,"select create_group_thread('Group',array[$1,$2]::uuid[]) id",[F,U]);const key='group-avatars/'+t.rows[0].id+'/avatar.jpg';
    const up=await writeAs(F,"insert into storage.objects(bucket_id,name) values('post-images',$1)",[key]);assert(!up.denied,up.error);
    const edit=await writeAs(F,'update dm_threads set group_avatar_url=$1,name=$2 where id=$3 returning id',[key,'Renamed',t.rows[0].id]);assert(!edit.denied,edit.error);assert.equal(edit.rows.length,1);
    assert(await mediaAllowed(U,key));assert(!await mediaAllowed(C,key));
    await db.query('delete from dm_thread_members where thread_id=$1 and user_id=$2',[t.rows[0].id,U]);return !await mediaAllowed(U,key);
  });
  await test('Storage rotation commits every parent and invalidates the previous path',async()=>{
    await db.query('update posts set image_url=$1 where id=$2',[object,P]);const next=J+'/private-v1/new.jpg';
    await db.query("insert into storage.objects(bucket_id,name) values('post-images',$1)",[next]);
    assert((await writeAs(J,'select replace_private_media_path($1,$2)',[object,next])).denied);
    await db.query('select replace_private_media_path($1,$2)',[object,next]);
    return !await mediaAllowed(C,object)&&await mediaAllowed(C,next)&&await scalar('select count(*)::int from media_object_deletions where name=$1',[object])===1;
  });
  await test('queued object cannot be reattached while deletion is in flight',async()=>{
    await db.query("insert into media_object_deletions(bucket_id,name) values('post-images',$1)",[object]);
    return (await writeAs(J,"insert into posts(user_id,text,image_url,expires_at) values($1,'Retry',$2,now()+interval '1 hour') returning id",[J,object])).denied;
  });
  await test('demo coordinate RPC cannot expose a real user even with a forged status demo flag',async()=>{
    await db.exec('set local role service_role');await db.query('update night_statuses set is_demo=true where user_id=$1',[J]);await db.exec('reset role');
    return (await as(U,'select * from get_demo_status_locations() where user_id=$1',[J])).rows.length===0;
  });

  await test('explicit owner-issued invite redemption preserves consent without duplicate pair rows',async()=>{
    const inv=await writeAs(J,"insert into invite_codes(user_id,code,max_uses) values($1,'SYNTHETIC',1) returning id",[J]);assert(!inv.denied,inv.error);
    const wrong=await writeAs(F,"select process_invite_code('SYNTHETIC',$1) result",[U]);assert.equal(wrong.rows[0]?.result.success,false);
    const redeemed=await writeAs(U,"select process_invite_code('SYNTHETIC',$1) result",[U]);assert(!redeemed.denied,redeemed.error);assert.equal(redeemed.rows[0]?.result.success,true);
    assert.equal(await scalar('select count(*)::int from friendships where least(user_id,friend_id)=least($1::uuid,$2::uuid) and greatest(user_id,friend_id)=greatest($1::uuid,$2::uuid)',[J,U]),1);
    return (await writeAs(U,"select process_invite_code('SYNTHETIC',$1) result",[U])).rows[0]?.result.success===false;
  });
  await test('invalid or blocked invite redemption cannot manufacture friendship',async()=>{
    assert.equal((await writeAs(U,"select process_invite_code('MISSING',$1) result",[U])).rows[0]?.result.success,false);
    await writeAs(J,"insert into invite_codes(user_id,code) values($1,'BLOCKED')",[J]);
    await writeAs(J,'insert into blocked_users(blocker_id,blocked_id) values($1,$2)',[J,U]);
    return (await writeAs(U,"select process_invite_code('BLOCKED',$1) result",[U])).rows[0]?.result.success===false && !(await scalar('select spotted_private.direct_friend($1,$2)',[J,U]));
  });
  await test('native owner status mutation succeeds without reopening protected-column upserts',async()=>{
    const raw=await writeAs(J,"insert into night_statuses(user_id,status,lat,lng,expires_at) values($1,'out',40.7,-74,now()+interval '1 hour') on conflict(user_id) do update set lat=excluded.lat",[J]);assert(raw.denied);
    const patch={user_id:J,status:'out',lat:40.7,lng:-74,expires_at:new Date(Date.now()+3600000).toISOString(),updated_at:new Date().toISOString(),is_private_party:true,party_address:'Owner address'};
    const r=await writeAs(J,'select upsert_own_night_status($1::jsonb)',[JSON.stringify(patch)]);assert(!r.denied,r.error);
    assert.equal((await as(J,'select party_address from get_own_night_status()')).rows[0].party_address,'Owner address');
    assert.equal((await as(J,'select lat from party_locations where user_id=$1',[J])).rows[0].lat,40.7);
    assert((await writeAs(U,'select upsert_own_night_status($1::jsonb)',[JSON.stringify(patch)])).denied);
    assert((await writeAs(J,'select upsert_own_night_status($1::jsonb)',[JSON.stringify({...patch,is_demo:true})])).denied);
    return true;
  });
  await test('TBD without an explicit audience inherits the owner global audience',async()=>{
    await db.query("update profiles set location_sharing_level='close_friends' where id=$1",[J]);
    const r=await writeAs(J,'select upsert_own_night_status($1::jsonb)',[JSON.stringify({user_id:J,status:'planning',planning_visibility:null,party_address:null})]);assert(!r.denied,r.error);
    return (await as(F,'select planning_neighborhood from night_statuses where user_id=$1',[J])).rows.length===0 && (await as(C,'select planning_neighborhood from night_statuses where user_id=$1',[J])).rows.length===1;
  });
  await test('native map query and own-status RPC work with protected-column grants',async()=>{
    const source=fs.readFileSync(root+'/mobile/src/hooks/use-map-data.ts','utf8');
    const projection=source.match(/let statusQuery[\s\S]*?\.select\(\s*'([^']+)'/)[1];
    const read=await as(F,'select '+projection+' from night_statuses where user_id=$1',[J]);assert(!read.denied,read.error);assert.equal(read.rows.length,1);
    const own=await as(J,'select * from get_own_night_status()');return own.rows[0]?.user_id===J&&own.rows[0]?.lat===40.7;
  });
  await test('abandoned and account-deleted Mux uploads enter the provider deletion queue',async()=>{
    await db.query("insert into mux_uploads(upload_id,user_id,asset_id,created_at) values('abandoned',$1,'abandoned-asset',now()-interval '25 hours'),('account',$1,'account-asset',now())",[J]);
    await db.query('select * from pending_private_media_cleanup()');
    assert.equal(await scalar("select count(*)::int from mux_asset_deletions where asset_id='abandoned-asset'"),1);
    await db.query('delete from profiles where id=$1',[J]);
    return await scalar("select count(*)::int from mux_asset_deletions where asset_id='account-asset'")===1;
  });
  await test('trusted demo identity remains visible without exposing user-forged demo flags',async()=>{
    await db.exec('set local role service_role');await db.query('update profiles set is_demo=true where id=$1',[J]);await db.exec('reset role');
    assert.equal((await as(U,'select * from get_demo_status_locations() where user_id=$1',[J])).rows.length,1);
    return (await as(U,'select text from posts where id=$1',[P])).rows.length===1 && (await as(U,'select venue_name from night_statuses where user_id=$1',[J])).rows.length===1;
  });

 }
 if(fixed){await db.exec(fs.readFileSync(root+'/supabase/tests/reliable_live_location.sql','utf8'));console.log('Original location SQL passed on the complete corrected schema');}
 await db.close();
}
(async()=>{await run(false);await run(true);console.log(JSON.stringify(results,null,2));console.log(`${results.length} before/after authorization assertions passed`);})().catch(e=>{console.error(e.stack,e.where);console.error(JSON.stringify(results.slice(-2)));process.exitCode=1});
