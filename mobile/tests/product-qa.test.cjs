const test=require('node:test'),assert=require('node:assert/strict');
const {load,extract,callback,builder,flush,source}=require('./product-test-runtime.cjs');
const threadState=load('lib/thread-state.ts');
test('QA-01 unavailable shared post is bounded; eligible post appears on next scheduled revalidation',async()=>{
 let state=new Map(),queries=0,rows=[],timer;
 const scope={sharedPostIds:'p',refreshSharedPostsRef:{current:()=>{}},AppState:{currentState:'active'},setSharedPosts:x=>state=x,setThreadError:()=>{},supabase:{from:()=>{queries++;return builder({data:rows,error:null});}},fetchProfilesSafe:async()=>[{id:'a',display_name:'Jane'}],sharedPostResults:threadState.sharedPostResults,resolvePostImageUrl:async x=>x,muxThumbnailUrl:()=>'',onNightBoundary:()=>()=>{},setInterval:fn=>{timer=fn;return 1},clearInterval:()=>{}};
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
test('QA-06 failed delayed send preserves newer draft; unchanged draft can retry',async()=>{
 for(const changed of [false,true]){
 let rows=[],draft='hello',finish;const revision={current:0},sending={current:false};
 const q={insert:()=>q,select:()=>q,single:()=>new Promise(r=>finish=r)};
 const send=extract('app/thread.tsx','send',{draft,userId:'a',threadId:'t',sendingRef:sending,draftRevision:revision,setDraft:x=>draft=x,setMessages:f=>rows=f(rows),supabase:{from:()=>q},Alert:{alert:()=>{}},setThreadError:()=>{},confirmMessage:threadState.confirmMessage});
 const work=send();if(changed){draft='newer';revision.current++;}finish({data:null,error:{message:'offline'}});await work;
 assert.equal(draft,changed?'newer':'hello');assert.equal(sending.current,false);assert.equal(rows.length,0);
 }
});
test('QA-03/04 Plans and group DM routes preserve destination; invalid source uses inbox',()=>{
 const calls=[];extract('app/activity.tsx','goToPlans',{router:{back:()=>{},navigate:x=>calls.push(x)},setTimeout:fn=>fn()})();assert.equal(calls[0],'/messages?tab=plans');
 const routes=load('lib/push.ts',{'@react-native-async-storage/async-storage':{},'react-native':{},'expo-notifications':{},'./supabase':{}});
 const id='00000000-0000-4000-8000-000000000007';assert.equal(routes.routeForNotification({type:'dm',data:{thread_id:id}}),`/thread?threadId=${id}`);assert.equal(routes.routeForNotification({type:'dm',data:{}}),'/messages?tab=dms');
 const dmBlock=source('app/activity.tsx').split('{dms.map')[1].split('</>')[0];assert.match(dmBlock,/routeForNotification/);assert.doesNotMatch(dmBlock,/openThreadWith/);
});
test('QA-02/28 leaderboard uses authorized status columns, surfaces errors, and has no invented movement/energy',async()=>{
 const s=source('hooks/use-leaderboard.ts');assert.doesNotMatch(s,/\.not\('(lat|lng)'/);assert.doesNotMatch(s,/Math\.random|const topBootstrapVenue/);
 const energy=extract('hooks/use-leaderboard.ts','calculateEnergyLevel');assert.equal(energy(1,0),0);assert.equal(energy(20,10),3);
 const fail=extract('hooks/use-leaderboard.ts','fetchLeaderboard',{supabase:{from:()=>builder({data:null,error:new Error('denied')})},isDemoMode:()=>false,fetchProfilesSafe:async()=>[]});await assert.rejects(fail('nyc',null,'a',[]),/denied/);
});
test('QA-35 shared card opens post detail while ordinary messages retain reactions',()=>{
 const s=source('app/thread.tsx');const calls=[];extract('app/thread.tsx','openSharedPost',{router:{push:route=>calls.push(route)}})('visible-post');assert.equal(calls[0].pathname,'/post-detail');assert.equal(calls[0].params.postId,'visible-post');assert.match(s,/onPress=\{\(\) => openSharedPost\(sharedPost.id\)\}/);assert.match(s,/onPress=\{\(\) => onMessageTap\(item.id\)\}/);
});
const haptics={'expo-haptics':{notificationAsync:()=>{},NotificationFeedbackType:{Success:1}}};
function inviteApi(rows,error=null){return load('lib/venue-invites.ts',{...haptics,'./profiles':{fetchProfilesSafe:async()=>[]},'./supabase':{supabase:{rpc:async()=>({data:rows,error}),from:()=>builder({data:rows,error}),functions:{invoke:async()=>({})}}}});}
test('QA-07 venue confirmations list only actual recipients and deny zero-result success',async()=>{
 const friends=[{id:'a'},{id:'b'}];const none=await inviteApi([]).sendVenueInvites('me','Bar',friends);assert.equal(none.ok,false);
 const some=await inviteApi([{id:'n',receiver_id:'b'}]).sendVenueInvites('me','Bar',friends);assert.equal(some.ok,true);assert.equal(some.recipientIds.join(','),'b');assert.equal(some.notificationIds.join(','),'n');
});
test('QA-08 Undo needs returned deleted IDs: zero/partial fails, actual delete succeeds',async()=>{
 assert.equal(await inviteApi([]).undoNotifications(['read']),false);
 assert.equal(await inviteApi([{id:'a'}]).undoNotifications(['a','b']),false);
 assert.equal(await inviteApi([{id:'a'}]).undoNotifications(['a']),true);
});
test('QA-07 meetup reports rejected recipient as failure and accepted recipient as sent',async()=>{
 for(const allowed of [false,true]){
 const api=load('lib/meet-up.ts',{...haptics,'react-native':{Alert:{alert:()=>{}}},'./profiles':{fetchProfilesSafe:async()=>[]},'./dm':{},'./tonight':{nightStartAt:()=>new Date(0)},'./supabase':{supabase:{from:()=>builder({data:[],error:null}),rpc:async()=>({data:allowed?[{id:'n'}]:[],error:null}),functions:{invoke:async()=>({})}}}});
 assert.equal((await api.sendMeetUp('a',{user_id:'b',display_name:'B'})).status,allowed?'sent':'failed');
 }
});
test('QA-09 check-in uses one atomic RPC; local resume failure never reports committed save as failed',async()=>{
 for(const failed of [false,true]){
  let calls=0;const api=load('lib/night-status.ts',{'./session-identity':{},'./supabase':{supabase:{rpc:async(name)=>{assert.equal(name,'commit_night_status');calls++;return{data:{gps_shared:false},error:null}}}},'./tonight':{},'./venue-arrival-engine':{markManualCheckin:()=>{}},'./location-ready':{automaticUpdatesEnabled:async()=>false},'./location-quality':{validFix:()=>true},'./background-location':{pauseLocationForStatusChange:async()=>{},allowLocationAfterCheckin:async()=>{if(failed)throw Error('local storage')}}});
  const result=await api.goOutAtVenue('a',{venue:{id:null,name:'Test'}});assert.equal(calls,1);assert.equal(result.gpsShared,false);assert.equal(result.trackingReady,!failed);
 }
});
test('QA-13/16 sensitive query policy hides stale denied data, distinguishes failure, and retains authorized data',()=>{
 let response={data:['allowed'],isError:false},options;
 const api=load('hooks/use-private-query.ts',{'@tanstack/react-query':{useQuery:o=>{options=o;return response;}}});
 assert.equal(api.usePrivateQuery({queryKey:['x']}).data[0],'allowed');
 response={data:['previously-private'],isError:true};const denied=api.usePrivateQuery({queryKey:['x']});assert.equal(denied.data,undefined);assert.equal(denied.isError,true);
 assert.equal(options.refetchInterval,15000);assert.equal(options.retry,false);assert.equal(options.refetchOnMount,'always');
 response={data:[],isError:false};assert.equal(api.usePrivateQuery({queryKey:['x']}).data.length,0);
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
test('QA-25 eligible mutual realtime event triggers canonical feed read, without a direct-friend filter',()=>{
 let refreshed=0,listener;const effect=callback('hooks/use-feed.ts','useEffect',"name: 'feed-realtime'",{userId:'viewer',friendIds:['direct'],refresh:()=>refreshed++,createResilientChannel:config=>{config.configure({on:(...args)=>{listener=args.at(-1)}});return()=>{}}});
 effect.fn();listener({new:{user_id:'eligible-mutual'}});assert.equal(refreshed,1);
 listener({new:{user_id:'revoked'}});assert.equal(refreshed,2); // RPC/RLS, not the event payload, decides visibility.
});
test('QA-27 standalone Like toggles cached state and rolls back failed writes',async()=>{
 for(const fails of [false,true]){
 let cached={post:{id:'p',likes_count:0},isLiked:false},writes=0;const pending={current:false};
 const scope={privateViewRevision:()=>0,post:cached.post,session:{user:{id:'a'}},likePending:pending,handedOver:false,toggleLike:null,postId:'p',isLiked:false,fetched:{data:cached},queryClient:{cancelQueries:async()=>{},setQueryData:(key,value)=>cached=value},toggleLikeStandalone:async()=>{writes++;if(fails)throw Error('offline')},invalidateFeed:()=>{},Alert:{alert:()=>{}}};
 await extract('app/post-detail.tsx','onLike',scope)();assert.equal(cached.isLiked,!fails);assert.equal(cached.post.likes_count,fails?0:1);assert.equal(pending.current,false);assert.equal(writes,1);
 if(!fails){scope.post=cached.post;scope.isLiked=true;scope.fetched={data:cached};await extract('app/post-detail.tsx','onLike',scope)();assert.equal(cached.isLiked,false);assert.equal(cached.post.likes_count,0);}
 }
});
test('QA-17 returning-profile read error does not become onboarding; genuine new and complete accounts still resolve',async()=>{
 for(const data of [null,{display_name:'Jane',username:'jane',created_at:'2026-09-01T00:00:00Z'}]){
 const fn=extract('hooks/use-session.tsx','fetchOnboardingNeeded',{supabase:{from:()=>builder({data,error:null})},hasSeenTour:async()=>false,TOUR_FLAG_SHIPPED_AT:Date.parse('2026-09-22T00:00:00Z')});assert.equal(await fn('a'),data===null);
 }
 const denied=extract('hooks/use-session.tsx','fetchOnboardingNeeded',{supabase:{from:()=>builder({data:null,error:new Error('offline')})}});await assert.rejects(denied('a'),/offline/);
 assert.match(source('app/_layout.tsx'),/if \(onboardingError\) return/);assert.match(source('app/_layout.tsx'),/Retry loading profile/);
});
test('QA-18 double Continue during permission prompt advances once; final step stays bounded and retry works',async()=>{
 let step=3,release;const busy={current:false};const scope={advancing:busy,setPending:()=>{},step:3,TOTAL:7,askForLocation:()=>new Promise(r=>release=r),finish:async()=>{},setStep:fn=>step=fn(step),setFinishing:()=>{},Alert:{alert:()=>{}}};
 const advance=extract('app/onboarding/welcome.tsx','advance',scope);const first=advance();await advance();assert.equal(step,3);release();await first;assert.equal(step,4);assert.equal(busy.current,false);
 scope.step=7;scope.finish=async()=>{throw Error('offline')};await extract('app/onboarding/welcome.tsx','advance',scope)();assert.equal(step,4);assert.equal(busy.current,false);
});
test('QA-19 late username availability cannot approve a different edited handle',async()=>{
 let finish,available=null,err=null,checking=true;const revision={current:1};
 const fn=extract('app/onboarding/username.tsx','checkUsernameAvailability',{USERNAME_REGEX:/^[a-z0-9_.]{3,20}$/,RESERVED_USERNAMES:new Set(),usernameRevision:revision,setUsernameAvailable:x=>available=x,setUsernameError:x=>err=x,setSuggestions:()=>{},setUsernameChecking:x=>checking=x,supabase:{rpc:()=>new Promise(r=>finish=r)}});
 const old=fn('first',1);revision.current=2;finish({data:true,error:null});await old;assert.equal(available,null);
 const now=fn('second',2);finish({data:false,error:null});await now;assert.equal(available,false);assert.match(err,/taken/);assert.equal(checking,false);
 const good=fn('third',2);finish({data:true,error:null});await good;assert.equal(available,true);assert.equal(err,null);
});
test('QA-23 malformed sent-confirmation payloads are unavailable, legitimate recipients survive',()=>{
 const api=load('lib/route-input.ts');for(const raw of [undefined,'null','{}','[]','not-json','[null,4,{}]'])assert.equal(api.parseConfirmationPeople(raw).length,0);
 const legit=JSON.stringify([{id:'a',display_name:'Jane',avatar_url:null}]);assert.equal(api.parseConfirmationPeople(legit)[0].display_name,'Jane');
 const join=extract('app/sent-confirmation.tsx','joinNames');assert.equal(join([]),'nobody');assert.equal(join(api.parseConfirmationPeople(legit)),'Jane');
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
test('QA-22 Morning After reads only owned visit history, never expired posts, and reports visit failures',async()=>{
 const {queryFunction}=require('./product-test-runtime.cjs');let tables=[];
 for(const fails of [false,true]){
 const recap=queryFunction('app/morning-after.tsx','morning-after',{session:{user:{id:'a'}},getActiveCity:()=>null,nightStartAt:d=>new Date(d.getTime()-1),supabase:{from:table=>{tables.push(table);return builder(table==='profiles'?{data:{city:'nyc'},error:null}:{data:[{id:'visit'}],error:fails?Error('offline'):null});}}});
 if(fails)await assert.rejects(recap(),/offline/);else assert.equal((await recap()).visits[0].id,'visit');
 }
 assert.deepEqual([...new Set(tables)],['profiles','checkins']);assert.doesNotMatch(source('app/check-in.tsx'),/saved posts from last night/);
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
test('QA-08 meetup cancellation does not claim success after partial recall; complete recall succeeds',async()=>{
 for(const count of [0,1,2]){
 let reads=0;const api=load('lib/meet-up.ts',{...haptics,'react-native':{},'./profiles':{},'./dm':{},'./tonight':{nightStartAt:()=>new Date(0)},'./supabase':{supabase:{from:()=>builder({data:reads++===0?[{id:'one'},{id:'two'}]:Array.from({length:count},(_,i)=>({id:String(i)})),error:null})}}});
 if(count===2)await api.cancelMeetUp('a','b');else await assert.rejects(api.cancelMeetUp('a','b'),/every request/);
 }
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
 const catalogue=[{id:'v',name:'Test',city:'nyc',popularity_rank:1,is_leaderboard_promoted:false,opened_at:null,operating_hours:null,neighborhood:'N'}];let venueReads=0;
 const status=occupied?[{venue_id:'v',venue_name:'Test',user_id:'friend',updated_at:new Date().toISOString(),venues:catalogue[0]}]:[];
 const fn=extract('hooks/use-leaderboard.ts','fetchLeaderboard',{supabase:{from:t=>builder({data:t==='night_statuses'?status:venueReads++===0?[]:catalogue,error:null})},isDemoMode:()=>false,fetchProfilesSafe:async()=>[{id:'friend',display_name:'Friend'}],buildProfileMap:rows=>new Map(rows.map(p=>[p.id,p])),BOOTSTRAP_MODE:true,isVenueOpen:()=>true,isNightlifeHours:()=>true,calculateEnergyLevel:extract('hooks/use-leaderboard.ts','calculateEnergyLevel')});
 const result=await fn('nyc',null,'me',['friend']);assert.equal(result.venues[0].count,occupied?1:0);assert.equal(result.venues[0].energyLevel,occupied?1:0);assert.equal(result.venues[0].movement,'same');assert.equal(!!result.biggestMover,occupied);
 }
});

test('QA-21 a delayed HTTP confirmation cannot restore a prior-night DM after 5 AM',async()=>{
 for(const currentNight of [false,true]){
 let rows=[],finish;const send=extract('app/thread.tsx','send',{draft:'hello',userId:'a',threadId:'t',sendingRef:{current:false},draftRevision:{current:0},setDraft:()=>{},setMessages:f=>rows=f(rows),supabase:{from:()=>({insert(){return this},select(){return this},single:()=>new Promise(r=>finish=r)})},Alert:{alert:()=>{}},setThreadError:()=>{},confirmMessage:threadState.confirmMessage,isFromTonight:()=>currentNight});
 const pending=send();rows=[];finish({data:{id:'saved',created_at:'2026-09-25T08:59:59Z'},error:null});await pending;assert.equal(rows.length,currentNight?1:0);
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
