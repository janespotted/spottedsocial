const test=require('node:test'),assert=require('node:assert/strict');
const {load,extract,callback,builder,flush,source}=require('./product-test-runtime.cjs');
const threadState=load('lib/thread-state.ts');
test('QA-01 unavailable shared post is bounded; eligible post appears on next scheduled revalidation',async()=>{
 let state=new Map(),queries=0,rows=[],timer;
 const scope={privateViewRevision:()=>0,sharedPostIds:'p',refreshSharedPostsRef:{current:()=>{}},AppState:{currentState:'active'},setSharedPosts:x=>state=x,setThreadError:()=>{},supabase:{from:()=>{queries++;return builder({data:rows,error:null});}},fetchProfilesSafe:async()=>[{id:'a',display_name:'Jane'}],sharedPostResults:threadState.sharedPostResults,resolvePostImageUrls:async urls=>new Map(urls.filter(Boolean).map(u=>[u,u])),resolveMuxPosters:async()=>new Map(),onNightBoundary:()=>()=>{},setInterval:fn=>{timer=fn;return 1},clearInterval:()=>{}};
 const effect=callback('app/thread.tsx','useFocusEffect','sharedPostResults',scope);
 assert.equal(effect.deps,'[sharedPostIds]');const stop=effect.fn();await flush();
 assert.equal(state.get('p'),null);assert.equal(queries,1);
 // Map result/state changes are not dependencies; only the explicit timer refetches.
 rows.push({id:'p',user_id:'a',text:'allowed',image_url:null,venue_name:'Test'});timer();await flush();
 assert.equal(state.get('p').text,'allowed');assert.equal(queries,2);stop();assert.equal(state.size,0);
});
test('QA-06 confirmed messages reconcile HTTP/realtime in either order',()=>{
 for(const rows of [[{id:'temp'}],[{id:'temp'},{id:'server'}],[{id:'server'},{id:'temp'}]]){
  const result=threadState.confirmMessage(rows,'temp',{id:'server',text:'hello'});assert.equal(result.length,1);assert.equal(result[0].text,'hello');
 }
});
test('QA-06 failed delayed send keeps a retryable row and does not replace a newer draft',async()=>{
 let draft='hello',finish; const pendingRef={current:[]};const sendingRef={current:false};
 const updatePending=rows=>pendingRef.current=rows;
 const scope={setUploading:()=>{},getSessionUserId:()=> 'a',userId:'a',threadId:'t',sendingRef,pendingRef,updatePending,isFromTonight:()=>true,setMessages:()=>{},confirmMessage:threadState.confirmMessage,
  deliverDm:()=>new Promise((resolve,reject)=>{finish=()=>reject(Error('offline'))})};
 const retryMessage=extract('app/thread.tsx','retryMessage',scope);
 const send=extract('app/thread.tsx','send',{...scope,draft,setDraft:v=>draft=v,retryMessage,pendingDm:(_u,_t,text)=>({id:'stable-id',text,created_at:new Date().toISOString()})});
 const pending=send();draft='newer draft';finish();await pending;
 assert.equal(draft,'newer draft');assert.equal(pendingRef.current[0].text,'hello');assert.equal(pendingRef.current[0].id,'stable-id');assert.equal(pendingRef.current[0].failed,true);assert.equal(sendingRef.current,false);
});
test('QA-03/04 Plans and group DM routes preserve destination; invalid source uses inbox',()=>{
 const calls=[];extract('app/activity.tsx','goToPlans',{router:{back:()=>{},navigate:x=>calls.push(x)},setTimeout:fn=>fn()})();assert.equal(calls[0],'/messages?tab=plans');
 const routes=load('lib/push.ts',{'@react-native-async-storage/async-storage':{},'react-native':{},'expo-notifications':{},'./supabase':{}});
 const id='00000000-0000-4000-8000-000000000007';assert.equal(routes.routeForNotification({type:'dm',data:{thread_id:id}}),`/thread?threadId=${id}`);assert.equal(routes.routeForNotification({type:'dm',data:{}}),'/messages?tab=dms');
 const dmBlock=source('app/activity.tsx').split('{dms.map')[1].split('</>')[0];assert.match(dmBlock,/routeForNotification/);assert.doesNotMatch(dmBlock,/openThreadWith/);
});
test('QA-02/28 leaderboard uses authorized status columns, surfaces errors, and has no invented movement/energy',async()=>{
 const s=source('hooks/use-leaderboard.ts');assert.doesNotMatch(s,/\.not\('(lat|lng)'/);assert.doesNotMatch(s,/Math\.random|const topBootstrapVenue/);
 const fail=extract('hooks/use-leaderboard.ts','fetchLeaderboard',{fetchHotSpotsCatalog:async()=>{throw Error('denied')},fetchVisibleVenuePresence:async()=>[],isDemoMode:()=>false,fetchProfilesSafe:async()=>[]});await assert.rejects(fail('nyc',null,'a',[]),/denied/);
});
test('QA-35 shared card opens post detail while ordinary messages retain reactions',()=>{
 const s=source('app/thread.tsx');const calls=[];extract('app/thread.tsx','openSharedPost',{router:{push:route=>calls.push(route)}})('visible-post');assert.equal(calls[0].pathname,'/post-detail');assert.equal(calls[0].params.postId,'visible-post');assert.match(s,/onPress=\{\(\) => openSharedPost\(sharedPost.id\)\}/);assert.match(s,/onPress=\{\(\) => onMessageTap\(item.id\)\}/);
});
const haptics={'expo-haptics':{notificationAsync:()=>{},NotificationFeedbackType:{Success:1}}};
function inviteApi(data,error=null){return load('lib/dm-invites.ts',{...haptics,'./supabase':{supabase:{rpc:async()=>({data,error}),from:()=>builder({data,error})}}});}
test('QA-07 venue confirmations list only actual recipients and deny zero-result success',async()=>{
 const friends=[{id:'a'},{id:'b'}];const none=await inviteApi([]).sendVenueInvites('venue',friends);assert.equal(none.ok,false);
 const some=await inviteApi([{invite_id:'i',receiver_id:'b',thread_id:'t',created:true}]).sendVenueInvites('venue',friends);
 assert.equal(some.ok,true);assert.equal(some.recipientIds.join(','),'b');assert.equal(some.inviteIds.join(','),'i');assert.equal(some.threadIds.b,'t');
 // A double tap returns the card already made: shown as sent, but not this send's to undo.
 const again=await inviteApi([{invite_id:'i',receiver_id:'b',thread_id:'t',created:false}]).sendVenueInvites('venue',friends);
 assert.equal(again.ok,true);assert.equal(again.inviteIds.length,0);
});
test('QA-08 Undo needs every invite withdrawn: zero/partial fails, full withdrawal succeeds',async()=>{
 assert.equal(await inviteApi(0).withdrawInvites(['read']),false);
 assert.equal(await inviteApi(1).withdrawInvites(['a','b']),false);
 assert.equal(await inviteApi(1).withdrawInvites(['a']),true);
 assert.equal(await inviteApi(null,{message:'x'}).withdrawInvites(['a']),false);
});
test('QA-07 meetup reports rejected recipient as failure and accepted recipient as sent',async()=>{
 for(const allowed of [false,true]){
 const api=load('lib/meet-up.ts',{...haptics,'react-native':{Alert:{alert:()=>{}}},'./dm':{},'./supabase':{supabase:{rpc:async()=>({data:allowed?[{result:'sent',invite_id:'i',thread_id:'t'}]:[],error:null})}}});
 const r=await api.sendMeetUp({user_id:'b'});assert.equal(r.status,allowed?'sent':'failed');
 if(allowed){assert.equal(r.inviteId,'i');assert.equal(r.threadId,'t');}
 }
});
test('QA-09 check-in uses one atomic RPC; local resume failure never reports committed save as failed',async()=>{
 for(const failed of [false,true]){
  let calls=0;const api=load('lib/night-status.ts',{'./session-identity':{getSessionRevision:()=>1,assertSessionRevision:()=>{}},'./supabase':{supabase:{rpc:async(name)=>{assert.equal(name,'commit_night_status');calls++;return{data:{gps_shared:false},error:null}}}},'./tonight':{},'./venue-arrival-engine':{markManualCheckin:()=>{}},'./location-ready':{automaticUpdatesEnabled:async()=>false},'./location-quality':{validFix:()=>true},'./background-location':{pauseLocationForStatusChange:async()=>{},allowLocationAfterCheckin:async()=>{if(failed)throw Error('local storage')}}});
  const result=await api.goOutAtVenue('a',{venue:{id:null,name:'Test'}});assert.equal(calls,1);assert.equal(result.gpsShared,false);assert.equal(result.trackingReady,!failed);
 }
});
test('QA-13/16 private queries redact old data when refresh fails and preserve caller scheduling',()=>{
 let response={data:['allowed'],isError:false},options;
 const api=load('hooks/use-private-query.ts',{'@tanstack/react-query':{useQuery:o=>{options=o;return response;}}});
 assert.equal(api.usePrivateQuery({queryKey:['x'],staleTime:30000}).data[0],'allowed');
 // A missed revocation while offline must not leave old private data visible.
 response={data:['allowed'],isError:true};const blip=api.usePrivateQuery({queryKey:['x']});assert.equal(blip.data,undefined);assert.equal(blip.isError,true);
 api.usePrivateQuery({queryKey:['x'],staleTime:30000});assert.equal(options.refetchInterval,undefined);assert.equal(options.staleTime,30000);
 response={data:[],isError:false};assert.equal(api.usePrivateQuery({queryKey:['x']}).data.length,0);
});
test('QA-13 relationship signal reaches screens first, then refetches every private view',()=>{
 const order=[];let handler;
 const api=load('lib/relationship-events.ts',{'react-native':{AppState:{addEventListener:()=>({remove(){}})}},'@react-native-community/netinfo':{addEventListener:()=>()=>{}},'./private-media':{forgetPrivateMediaLinks:()=>order.push('forget')},'./private-views':{PRIVATE_VIEW_KEYS:['friend-ids','post-detail'],invalidatePrivateViews:()=>{order.push('reset:friend-ids');order.push('reset:post-detail')}},
  './resilient-channel':{createResilientChannel:config=>{config.configure({on:(_t,filter,fn)=>{assert.equal(filter.table,'relationship_events');assert.equal(filter.filter,'user_id=eq.viewer');handler=fn;return{}}});return()=>{}}}});
 api.onRelationshipChanged(other=>order.push('screen:'+other));
 api.subscribeRelationshipEvents('viewer',{invalidateQueries:({queryKey})=>order.push('refetch:'+queryKey[0])});
 handler({new:{other_user_id:'ex-friend'}});
 assert.deepEqual(order,['forget','screen:ex-friend','reset:friend-ids','reset:post-detail']);
});
test('QA-13/20/21 privacy and 5AM reset cancels old reads before clearing every sensitive parent and child',()=>{
 const api=load('lib/private-views.ts');let redacted=0,calls=[];api.onPrivateViewsInvalidated(()=>redacted++);
 const qc={cancelQueries:({queryKey})=>calls.push(['cancel',queryKey[0]]),resetQueries:({queryKey})=>calls.push(['reset',queryKey[0]])};
 const boundary=load('lib/night-boundary.ts',{'./private-views':api});let local=0;boundary.onNightBoundary(()=>local++);boundary.handleNightBoundary(qc);
 for(const key of ['audience-counts','plan-close-friends','friends-page','planning-friends','post-detail','comments','plan-comments','plan-downs','plan-participants','share-friends']){const i=calls.findIndex(x=>x[1]===key);assert.equal(calls[i][0],'cancel');assert.equal(calls[i+1][0],'reset');}
 assert.equal(redacted,1);assert.equal(local,1);
});
test('QA-14 live/draft audience confirmation waits for successful save; errors remain retryable and duplicate tap is ignored',async()=>{
 for(const fails of [false,true]){
 let complete,pops=0,errors=[],count=0;const saving={current:false};
 const confirm=extract('app/audience.tsx','confirm',{request:{onConfirm:()=>{count++;return new Promise((yes,no)=>{complete=()=>fails?no(Error('offline')):yes()})}},saving,value:'close_friends',setPending:()=>{},setError:x=>errors.push(x),router:{canGoBack:()=>true,back:()=>pops++},Haptics:{impactAsync:()=>{},ImpactFeedbackStyle:{Light:1}}});
 const first=confirm();await confirm();assert.equal(count,1);assert.equal(pops,0);complete();await first;assert.equal(pops,fails?0:1);assert.equal(saving.current,false);assert.equal(!!errors.at(-1),fails);
 }
 assert.match(source('app/audience.tsx'),/request\?\.live \? 'Saving changes/);
 assert.match(source('app/(tabs)/(profile)/profile.tsx'),/onChange=\{setPlanningVisibility\} live/);
});
test('QA-15 Staying In masks live activity but preserves explicit plans, invites and messages',()=>{
 const api=load('lib/live-preview.ts');assert.equal(api.withholdLivePreview('home'),true);assert.equal(api.withholdLivePreview('out'),false);assert.equal(api.withholdLivePreview('planning'),false);assert.equal(api.withholdLivePreview(undefined,false),true);
 assert.doesNotMatch(api.liveActivityMessage('friend_arrived_venue','At Secret Bar',true),/Secret Bar/);
 for(const type of ['venue_invite','plan_invite','dm','party_address_approved'])assert.equal(api.liveActivityMessage(type,'Explicit share',true),'Explicit share');
 assert.equal(api.liveActivityMessage('friend_arrived_venue','At Bar',false),'At Bar');
});
test('QA-16/20 failed plan child reads cannot masquerade as empty; authorized empty reads succeed',async()=>{
 for(const denied of [false,true]){
 const api=load('lib/plans.ts',{'./supabase':{supabase:{from:()=>builder({data:[],error:denied?new Error('offline'):null})}},'./profiles':{fetchProfilesSafe:async()=>[],buildProfileMap:()=>new Map()},'./tonight':{},'./demo-mode':{}});
 for(const name of ['fetchPlanDowns','fetchPlanParticipants','fetchPlanComments']){if(denied)await assert.rejects(api[name]('p'),/offline/);else assert.equal((await api[name]('p')).length,0);}
 }
});
test('QA-25 realtime posts: RLS-delivered mutual post is hydrated and shown without a direct-friend filter; deletes drop; failures re-read',async()=>{
 let posts=[],refreshed=0,fail=false;const listeners={};
 const effect=callback('hooks/use-feed.ts','useEffect',"name: 'feed-realtime'",{userId:'viewer',friendIds:['direct'],refresh:()=>refreshed++,runOrDefer:fn=>fn(),setPosts:f=>posts=f(posts),isDemoMode:()=>false,getSessionRevision:()=>1,assertSessionRevision:()=>{},
  hydratePosts:async rows=>{if(fail)throw Error('offline');return{posts:rows.map(r=>({id:r.id,user_id:r.user_id})),likedByMe:new Set()}},
  createResilientChannel:config=>{const ch={on:(_t,f,fn)=>{listeners[f.event]=fn;return ch}};config.configure(ch);return()=>{}}});
 effect.fn();
 await listeners.INSERT({new:{id:'m1',user_id:'eligible-mutual',expires_at:new Date(Date.now()+3600e3).toISOString()}});
 assert.equal(posts[0].id,'m1'); // RPC/RLS, not a client friend list, decides visibility.
 await listeners.INSERT({new:{id:'old',user_id:'direct',expires_at:new Date(Date.now()-1).toISOString()}});assert.equal(posts.length,1);
 listeners.DELETE({old:{id:'m1'}});assert.equal(posts.length,0);
 fail=true;await listeners.INSERT({new:{id:'m2',user_id:'direct',expires_at:new Date(Date.now()+3600e3).toISOString()}});assert.equal(refreshed,1);
});
test('QA-25 unfriend removes that author from the feed at once and re-reads',()=>{
 let posts=[{id:'1',user_id:'ex'},{id:'2',user_id:'stays'}],refreshed=0,listener;
 const effect=callback('hooks/use-feed.ts','useEffect','onRelationshipChanged',{onRelationshipChanged:fn=>{listener=fn;return()=>{}},runOrDefer:fn=>fn(),setPosts:f=>posts=f(posts),refresh:()=>refreshed++});
 effect.fn();listener('ex');assert.deepEqual(posts.map(p=>p.id),['2']);assert.equal(refreshed,1);
});
test('QA-27 standalone Like toggles cached state and rolls back failed writes',async()=>{
 for(const fails of [false,true]){
 let cached={post:{id:'p',likes_count:0},isLiked:false},writes=0;const pending={current:false};
 const scope={privateViewRevision:()=>0,post:cached.post,session:{user:{id:'a'}},likePending:pending,handedOver:false,toggleLike:null,postId:'p',isLiked:false,fetched:{data:cached},queryClient:{cancelQueries:async()=>{},setQueryData:(key,value)=>cached=value},toggleLikeStandalone:async()=>{writes++;if(fails)throw Error('offline')},invalidateFeed:()=>{},Alert:{alert:()=>{}}};
 await extract('app/post-detail.tsx','onLike',scope)();assert.equal(cached.isLiked,!fails);assert.equal(cached.post.likes_count,fails?0:1);assert.equal(pending.current,false);assert.equal(writes,1);
 if(!fails){scope.post=cached.post;scope.isLiked=true;scope.fetched={data:cached};await extract('app/post-detail.tsx','onLike',scope)();assert.equal(cached.isLiked,false);assert.equal(cached.post.likes_count,0);}
 }
});
test('QA-17 launch-state read failures preserve the gate and offer Retry',async()=>{
 let needed=true,reported=null;const fn=extract('hooks/use-session.tsx','refreshOnboardingStatus',{getSessionRevision:()=>1,assertSessionRevision:()=>{},supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'a'}}}})}},launchRpc:async()=>{throw Error('offline')},setOnboardingError:v=>reported=v,setOnboardingNeeded:v=>needed=v});
 await assert.rejects(fn(),/offline/);assert.equal(needed,true);assert.match(reported,/not been reset/);
 assert.match(source('app/_layout.tsx'),/if \(onboardingError\) return/);
});
test('QA-18 repeated onboarding taps submit once and an interrupted save remains retryable',async()=>{
 let calls=0,release,error=null;const saving={current:false};const perform=extract('app/onboarding/index.tsx','perform',{Error,saving,setBusy:()=>{},setError:v=>error=v});
 const first=perform(()=>{calls++;return new Promise(r=>release=r)});await perform(async()=>{calls++});assert.equal(calls,1);release();await first;
 await perform(async()=>{throw Error('offline')});assert.equal(error,'offline');assert.equal(saving.current,false);
 await perform(async()=>{calls++});assert.equal(calls,2);assert.equal(error,null);
});
test('QA-19 profile save uses server uniqueness and cannot confirm an unavailable username',async()=>{
 const {load}=require('./product-test-runtime.cjs');const calls=[];
 const api=load('lib/launch.ts',{'@/lib/supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:{code:'23505',message:'duplicate'}}}}}});
 await assert.rejects(api.launchRpc('save_launch_profile',{p_name:'Jane',p_username:'jane',p_terms:true}),/username is taken/);
 assert.equal(calls[0].args.p_username,'jane');
});
test('QA-23 malformed sent-confirmation payloads are unavailable, legitimate recipients survive',()=>{
 const api=load('lib/route-input.ts');for(const raw of [undefined,'null','{}','[]','not-json','[null,4,{}]'])assert.equal(api.parseConfirmationPeople(raw).length,0);
 const legit=JSON.stringify([{id:'a',display_name:'Jane',avatar_url:null}]);assert.equal(api.parseConfirmationPeople(legit)[0].display_name,'Jane');
 assert.equal(api.parseNotificationIds('null').length,0);assert.equal(api.parseNotificationIds('["00000000-0000-4000-8000-000000000001"]').length,1);
});
test('QA-24 both search and contact request failures roll back Sent; accepted requests stay Sent',async()=>{
 for(const [file,name,argument] of [['app/search.tsx','handleAdd','b'],['app/contacts-sync.tsx','addFriend',{user_id:'b'}]])for(const allowed of [false,true]){
 let values=new Set(),alerts=0,release;const pending={current:new Set()};const setter=f=>values=f(values);
 const scope={session:{user:{id:'a'}},userId:'a',pendingRequests:pending,sentIds:values,requested:values,setSentIds:setter,setRequested:setter,sendFriendRequest:()=>new Promise(r=>release=r),Haptics:{impactAsync:()=>{},ImpactFeedbackStyle:{Light:1}},Alert:{alert:()=>alerts++}};
 const send=extract(file,name,scope);const first=send(argument);await send(argument);assert.equal(values.has('b'),true);release(allowed);await first;assert.equal(values.has('b'),allowed);assert.equal(alerts,allowed?0:1);assert.equal(pending.current.size,0);
 }
});
test('QA-16 invite link read failure neither spins nor generates a replacement; legitimate existing code works',async()=>{
 for(const denied of [false,true]){
 const api=load('lib/invites.ts',{'./supabase':{supabase:{from:()=>builder({data:denied?null:{code:'ABCDEFGH',uses_count:1},error:denied?new Error('offline'):null})}}});
 if(denied)await assert.rejects(api.fetchOrCreateInviteCode('a'),/offline/);else assert.equal((await api.fetchOrCreateInviteCode('a')).code,'ABCDEFGH');
 }
});
test('QA-22 Morning After reads only the owner\'s recap RPC, never tables, and reports failures',async()=>{
 let tables=[],rpcs=[];
 const mk=(result)=>load('lib/night-recap.ts',{'./supabase':{supabase:{from:t=>{tables.push(t);return builder({data:null,error:null});},rpc:async(name)=>{rpcs.push(name);return result;}}},'./private-media':{},'./media-prep':{},'./post-media':{},'./publish-post':{}});
 await assert.rejects(mk({data:null,error:Object.assign(Error('offline'),{code:'x'})}).fetchNightRecap(),/offline/);
 assert.equal(await mk({data:null,error:null}).fetchNightRecap(),null,'no activity is null, never a fabricated recap');
 const r=await mk({data:{id:'r',night_date:'2026-10-04',stops:[{venue_name:'V'}]},error:null}).fetchNightRecap();
 assert.equal(r.id,'r');assert.equal(r.stops.length,1);assert.equal(r.photos.length,0);assert.equal(r.people.length,0);
 assert.equal(tables.length,0);assert.equal([...new Set(rpcs)].join(),'get_night_recap');
 assert.doesNotMatch(source('app/check-in.tsx'),/saved posts from last night/);
});
test('QA-26 venue/event date stays in profile-city night across UTC midnight, 5AM and DST',()=>{
 const tonight=load('lib/tonight.ts');
 for(const city of ['nyc','la'])assert.equal(tonight.getNightKey(new Date('2026-09-26T01:00:00Z'),city),'2026-09-25');
 assert.equal(tonight.getNightKey(new Date('2026-09-26T08:59:59Z'),'nyc'),'2026-09-25');assert.equal(tonight.getNightKey(new Date('2026-09-26T09:00:00Z'),'nyc'),'2026-09-26');
 assert.equal(tonight.getNightKey(new Date('2026-11-01T09:59:59Z'),'nyc'),'2026-10-31');assert.equal(tonight.getNightKey(new Date('2026-11-01T10:00:00Z'),'nyc'),'2026-11-01');
 const {queryFunction}=require('./product-test-runtime.cjs');let bound;
 const q=new Proxy({then:yes=>Promise.resolve({data:[],error:null}).then(yes)},{get:(o,k)=>k==='then'?o.then:(...args)=>{if(k==='gte'&&args[0]==='event_date')bound=args[1];return q;}});
 return queryFunction('components/venue-events-section.tsx','getNightKey',{getNightKey:()=> '2026-09-25',supabase:{from:()=>q},venueId:'v'})().then(()=>assert.equal(bound,'2026-09-25'));
});
test('QA-08 a refused meet up (e.g. before Night Mode opens) shows the server message',async()=>{
 const alerts=[];const err=Object.assign(new Error('Meet ups open when Night Mode starts at 6 PM.'),{hint:'night_mode_closed'});
 const api=load('lib/meet-up.ts',{...haptics,'react-native':{Alert:{alert:(t,m)=>alerts.push(m)}},'./dm':{},'./supabase':{supabase:{rpc:async()=>({data:null,error:err})}}});
 const r=await api.sendMeetUp({user_id:'b'});assert.equal(r.status,'failed');assert.equal(alerts[0],'Meet ups open when Night Mode starts at 6 PM.');
});
test('QA-29 device Location Services and app permission remain independent',async()=>{
 for(const enabled of [false,true]){const fn=extract('lib/location-ready.ts','locationServicesEnabled',{ensureLocationReady:async()=>{},BackgroundGeolocation:{getProviderState:async()=>({enabled,status:3})}});assert.equal(await fn(),enabled);}
 assert.doesNotMatch(source('app/(tabs)/(profile)/settings.tsx'),/Always — your spot updates as you move/);
});
test('QA-30 unrelated person is not a mutual or residual Close Friend; real tiers are preserved',()=>{
 const api=load('lib/relationship-tier.ts');assert.equal(api.relationshipTier(false,false,0),'unrelated');assert.equal(api.relationshipTier(true,false,0),'unrelated');assert.equal(api.relationshipTier(false,false,1),'mutual');assert.equal(api.relationshipTier(false,true,0),'direct');assert.equal(api.relationshipTier(true,true,0),'close');
});
test('QA-32 same-name people count separately; duplicate IDs count once, hidden status is explicit',()=>{
 const unique=extract('app/venue.tsx','uniquePeople');const result=unique([{id:'a',display_name:'Sam'},{id:'b',display_name:'Sam'},{id:'a',display_name:'Sam'}]);assert.equal(result.length,2);
 const status=extract('components/header-actions.tsx','statusWord');assert.equal(status('off').label,'Hidden');assert.equal(status('out').label,'Out');assert.equal(status('planning').label,'TBD');assert.equal(status('home').label,'In');
});
test('QA-34 restriction saves only refresh on actual removal; errors/zero rows retain restrictions and allow retry',async()=>{
 for(const result of [{data:null,error:Error('offline')},{data:[],error:null},{data:[{id:'r'}],error:null}]){
 let changes=0,alerts=0,pending=false;const saving={current:false};const fn=extract('app/(tabs)/(profile)/blocked-hidden.tsx','removeRestriction',{saving,setPending:x=>pending=x,supabase:{from:()=>builder(result)},invalidatePrivateViews:()=>changes++,queryClient:{},refetch:async()=>{},Alert:{alert:()=>alerts++}});
 await fn('blocked_users',{rowId:'r'});assert.equal(changes,result.data?.length?1:0);assert.equal(alerts,result.data?.length?0:1);assert.equal(pending,false);assert.equal(saving.current,false);
 }
});
test('QA-34 failed receipt setting does not confirm success; successful save revalidates and taps are serialized',async()=>{
 for(const denied of [false,true]){let refreshes=0,alerts=0;const lock={current:false};const fn=extract('app/(tabs)/(profile)/settings.tsx','toggleReadReceipts',{userId:'a',receiptSaving:lock,setReceiptPending:()=>{},supabase:{from:()=>builder({error:denied?Error('offline'):null})},refetch:async()=>refreshes++,queryClient:{invalidateQueries:()=>{}},Alert:{alert:()=>alerts++}});await fn(false);assert.equal(refreshes,denied?0:1);assert.equal(alerts,denied?1:0);assert.equal(lock.current,false);}
});
test('QA-20 every Plans child event revalidates parent, comments, downs and participants',()=>{
 const handlers={},invalidated=[];const fn=callback('hooks/use-plans.ts','useEffect',"name: 'plans-realtime'",{session:{user:{id:'a'}},queryClient:{invalidateQueries:({queryKey})=>invalidated.push(queryKey[0])},OWN_NIGHT_STATUS_KEY:'own-night-status',setTimeout:fn=>{fn();return 1},clearTimeout:()=>{},createResilientChannel:opts=>{const ch={on:(_kind,config,fn)=>{handlers[config.table]=fn;return ch;}};opts.configure(ch);return()=>{}}});
 fn.fn();for(const table of ['plan_downs','plan_votes','plan_comments','plan_participants','plans']){invalidated.length=0;handlers[table]();assert.deepEqual(invalidated,['plans','plan-downs','plan-participants','plan-comments']);}
});
test('QA-21 offline 5AM rollover clears local messages before network revalidation',()=>{
 let boundary,rows=[{text:'last-night'}],cards=new Map([['p','private']]),retried=0;
 callback('app/thread.tsx','useEffect','setMessages([]); setSharedPosts', {onNightBoundary:fn=>{boundary=fn;return()=>{}},setMessages:x=>rows=x,setSharedPosts:x=>cards=x,fetchMessages:()=>{retried++;return Promise.resolve();}}).fn();boundary();assert.equal(rows.length,0);assert.equal(cards.size,0);assert.equal(retried,1);
});
test('QA-23 editable Plan route loads authoritative owner data; deleted/unauthorized rows never hydrate a form',async()=>{
 const {queryFunction}=require('./product-test-runtime.cjs');for(const exists of [false,true]){
 let children=0,ownerFilter=false;const q=new Proxy({then:yes=>Promise.resolve({data:exists?{id:'p',user_id:'a',venue_name:'Server value'}:null,error:null}).then(yes)},{get:(o,k)=>k==='then'?o.then:(...args)=>{if(k==='eq'&&args[0]==='user_id'&&args[1]==='a')ownerFilter=true;return q;}});
 const fn=queryFunction('app/edit-plan.tsx','edit-plan',{params:{planId:'p',venueName:'Untrusted URL value'},session:{user:{id:'a'}},supabase:{from:()=>q},fetchPlanParticipants:async()=>{children++;return[]},fetchProfilesSafe:async()=>[]});const result=await fn();assert.equal(ownerFilter,true);if(exists){assert.equal(result.plan.venue_name,'Server value');assert.equal(children,1);}else{assert.equal(result,null);assert.equal(children,0);}
 }
});
test('QA-02/28 successful leaderboard retains real activity but catalog-only data never claims movement',async()=>{
 for(const occupied of [false,true]){
 const api=require('./hot-spots-test-runtime.cjs');
 const catalogue=[api.venue('v')];
 const status=occupied?[api.status('friend','v',{expires_at:'2099-01-01T00:00:00Z'})]:[];
 const fn=extract('hooks/use-leaderboard.ts','fetchLeaderboard',{fetchHotSpotsCatalog:async()=>catalogue,fetchVisibleVenuePresence:async()=>status,buildHotSpotsBoard:api.buildHotSpotsBoard,isDemoMode:()=>false,fetchProfilesSafe:async()=>[{id:'friend',display_name:'Friend'}]});
 const result=await fn('nyc',null,'me',['friend']);assert.equal(result.venues[0].count,occupied?1:0);assert.equal(result.venues[0].energyLevel,occupied?1:0);assert.equal(result.venues[0].movement,'same');assert.equal(!!result.biggestMover,occupied);
 }
});

test('QA-21 a delayed confirmation cannot restore a previous-night DM',async()=>{
 for(const currentNight of [false,true]){
 let rows=[],finish,checks=0;const message={id:'stable-id',created_at:'2026-10-12T08:00:00Z'};
 const pendingRef={current:[message]};
 const retry=extract('app/thread.tsx','retryMessage',{setUploading:()=>{},sendingRef:{current:false},pendingRef,userId:'a',getSessionUserId:()=> 'a',confirmedIds:{current:new Set()},updatePending:r=>pendingRef.current=r,isFromTonight:()=>++checks===1||currentNight,deliverDm:()=>new Promise(r=>finish=r),setMessages:f=>rows=f(rows),confirmMessage:threadState.confirmMessage});
 const work=retry(message);finish(message);await work;assert.equal(rows.length,currentNight?1:0);
 }
 assert.match(source('app/thread.tsx'),/if \(!isFromTonight\(newMsg.created_at\)\) return/);
});
test('QA-33 failed mark-read resets the badge from authorized server data, without restoring a private snapshot',async()=>{
 for(const failed of [false,true]){
 let rows=[{id:'n',is_read:false}],resets=0;
 const mark=extract('hooks/use-notifications.ts','markAllAsRead',{session:{user:{id:'a'}},unreadCount:1,queryClient:{setQueryData:(key,f)=>rows=f(rows),resetQueries:()=>{rows=[];resets++}},supabase:{from:()=>builder({error:failed?Error('offline'):null})}});
 await mark();assert.equal(resets,failed?1:0);assert.equal(rows.length,failed?0:1);if(!failed)assert.equal(rows[0].is_read,true);
 }
});
test('QA-13 late failed Like never restores a revoked post snapshot',async()=>{
 let epoch=0,cached={post:{id:'p',likes_count:0},isLiked:false},fail;
 const action=extract('app/post-detail.tsx','onLike',{privateViewRevision:()=>epoch,post:cached.post,session:{user:{id:'a'}},likePending:{current:false},handedOver:false,toggleLike:null,postId:'p',isLiked:false,fetched:{data:cached},queryClient:{cancelQueries:async()=>{},setQueryData:(key,value)=>cached=value},toggleLikeStandalone:()=>new Promise((yes,no)=>fail=no),invalidateFeed:()=>{},Alert:{alert:()=>{}}});
 const pending=action();await flush();epoch++;cached=undefined;fail(Error('denied'));await pending;assert.equal(cached,undefined);
});

test('QA-16/20 failed venue Plan child read cannot look like zero people; Plan card offers retry',async()=>{
 const {queryFunction}=require('./product-test-runtime.cjs');
 const fn=queryFunction('app/venue.tsx','venue-card',{isNight:true,fetchVisibleVenuePresence:async()=>[],session:{user:{id:'a'}},venueId:'v',friendIds:['friend'],getNightKey:()=> '2026-09-25',fetchProfilesSafe:async()=>[],buildProfileMap:()=>new Map(),uniquePeople:x=>x,toFriend:x=>x,supabase:{from:table=>builder(table==='venues'?{data:{id:'v',name:'Bar'},error:null}:table==='plans'?{data:[{id:'p'}],error:null}:table==='plan_downs'?{data:null,error:Error('child offline')}:{data:[],error:null})}});
 await assert.rejects(fn(),/child offline/);
 const s=source('components/plan-card.tsx');assert.match(s,/Could not load everyone on this plan/);assert.match(s,/!participantsError && !downsError && participants.length === 0/);assert.match(s,/disabled=\{isTogglingDown \|\| downsError\}/);
});


test('A DM fetch started before privacy revocation cannot restore its old messages',async()=>{
 for(const revoked of [false,true]){
  let revision=0,finish,rows=[],writes=0;
  const query=new Proxy({then:resolve=>new Promise(r=>finish=()=>r({data:[{id:'m',created_at:'now',image_url:null}],error:null})).then(resolve)},{get:(o,k)=>k==='then'?o.then:()=>query});
  const fn=extract('app/thread.tsx','fetchMessages',{threadId:'t',privateViewRevision:()=>revision,supabase:{from:()=>query},setThreadError:()=>{},isFromTonight:()=>true,confirmedIds:{current:new Set()},pendingRef:{current:[]},updatePending:()=>{},seenIdsRef:{current:new Set()},setMessages:v=>{writes++;rows=typeof v==='function'?v(rows):v;},resolvePostImageUrl:async()=>null});
  const work=fn();await flush();if(revoked)revision++;finish();await work;assert.equal(writes,revoked?0:1);assert.equal(rows.length,revoked?0:1);
 }
});


test('Plan save serializes rapid taps, keeps a failed draft, and leaves only after success',async()=>{
 let attempts=0,finish,error=false,saved=false,busy=false;
 const submissionLock={current:false};
 const values={selectedVenue:{id:'v',name:'Test'},planDate:'2026-10-12',planTime:'21:00',planType:null,description:'Keep this note',visibility:'friends',selectedFriends:[]};
 const submit=extract('components/plan-form.tsx','handleSubmit',{...values,saved:false,submissionLock,Keyboard:{dismiss(){}},setIsSubmitting:x=>busy=x,setSubmitError:x=>error=x,setSaved:x=>saved=x,onSubmit:v=>{attempts++;assert.equal(v.description,values.description);return new Promise((resolve,reject)=>finish=ok=>ok?resolve():reject(Error('offline')));}});
 const first=submit();await submit();assert.equal(attempts,1);assert.equal(busy,true);finish(false);await first;
 assert.equal(error,true);assert.equal(saved,false);assert.equal(busy,false);assert.equal(submissionLock.current,false);assert.equal(values.description,'Keep this note');
 const retry=submit();finish(true);await retry;assert.equal(attempts,2);assert.equal(saved,true);assert.equal(error,false);
});
