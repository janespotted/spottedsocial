const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),reactQuery=require('@tanstack/react-query');
function load(file,mocks,globals={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',...Object.keys(globals),code)(n=>{if(n in mocks)return mocks[n];throw Error('Missing '+n)},module,module.exports,...Object.values(globals));return module.exports;
}
function harness(fetchImpl=fetch){
 const identity=load('session-identity.ts',{}, {fetch:fetchImpl});
 const {queryClient}=load('query-client.ts',{'react-native':{AppState:{addEventListener:()=>({remove(){}})}},'@react-native-community/netinfo':{addEventListener:()=>()=>{}},'@tanstack/react-query':reactQuery,'./session-identity':identity});
 return{identity,queryClient};
}
test('audited unscoped cache reproduces Account A data returned to B without B fetch',async()=>{
 const client=new reactQuery.QueryClient();let calls=0;
 await client.fetchQuery({queryKey:['friend-card','Jane'],staleTime:60000,queryFn:async()=>({owner:'A',gps:40.7})});
 const got=await client.fetchQuery({queryKey:['friend-card','Jane'],staleTime:60000,queryFn:async()=>{calls++;return{owner:'B'}}});
 assert.equal(got.owner,'A');assert.equal(calls,0);client.clear();
});
test('identity change synchronously removes Account A cache and B performs its own fetch',async()=>{
 const {identity,queryClient}=harness();identity.setSessionIdentity('A','a');let calls=0;
 await queryClient.fetchQuery({queryKey:['friend-card','Jane'],staleTime:60000,queryFn:async()=>({owner:'A',gps:40.7})});
 identity.setSessionIdentity('B','b');assert.equal(queryClient.getQueryData(['friend-card','Jane']),undefined);
 const got=await queryClient.fetchQuery({queryKey:['friend-card','Jane'],staleTime:60000,queryFn:async()=>{calls++;return{owner:'B',gps:null}}});
 assert.equal(got.owner,'B');assert.equal(calls,1);queryClient.clear();
});
test('delayed A query ignoring AbortSignal cannot populate the B cache',async()=>{
 const {identity,queryClient}=harness();identity.setSessionIdentity('A','a');let finish;
 const waiting=queryClient.fetchQuery({queryKey:['friend-card','Jane'],queryFn:()=>new Promise(r=>finish=r)}).catch(()=>undefined);
 identity.setSessionIdentity('B','b');finish({owner:'A',gps:40.7});await waiting;await new Promise(r=>setImmediate(r));
 assert.equal(queryClient.getQueryData(['friend-card','Jane']),undefined);
 assert.equal(queryClient.getQueryCache().getAll().length,0);queryClient.clear();
});
test('delayed A transport response is rejected even if transport ignores abort',async()=>{
 let finish;const {identity}=harness(()=>new Promise(r=>finish=r));identity.setSessionIdentity('A','a');
 const result=identity.sessionFetch('https://synthetic.invalid/private');identity.setSessionIdentity('B','b');
 finish(new Response(JSON.stringify({private:'A'})));await assert.rejects(result,/Account changed/);
});
test('token refresh preserves caches and identity revision',async()=>{
 const {identity,queryClient}=harness();identity.setSessionIdentity('A','a');const revision=identity.getSessionRevision();
 queryClient.setQueryData(['own'],'A');identity.setSessionIdentity('A','new-token');
 assert.equal(identity.getSessionRevision(),revision);assert.equal(queryClient.getQueryData(['own']),'A');assert.equal(identity.getSessionAccessToken(),'new-token');queryClient.clear();
});
test('logout then relogin to same account cannot revive its previous private cache',()=>{
 const {identity,queryClient}=harness();identity.setSessionIdentity('A','a');queryClient.setQueryData(['own'],'private');
 identity.setSessionIdentity(null,null);identity.setSessionIdentity('A','another');assert.equal(queryClient.getQueryData(['own']),undefined);queryClient.clear();
});

test('A response body completing after B login is rejected',async()=>{
 let finish;const body=new ReadableStream({start(c){finish=()=>{c.enqueue(new TextEncoder().encode('{"private":"A"}'));c.close()}}});
 const {identity}=harness(async()=>new Response(body));identity.setSessionIdentity('A','a');
 const response=await identity.sessionFetch('https://synthetic.invalid/private');const decoded=response.json();
 identity.setSessionIdentity('B','b');finish();await assert.rejects(decoded,/Account changed/);
});
test('media links: one batched request, fresh links reused, unauthorized items dropped, cleared on account change',async()=>{
 const {identity}=harness();identity.setSessionIdentity('A','token-a');const asked=[];let allow=true;
 const now=Math.floor(Date.now()/1000);
 const invoke=async(name,{body})=>{asked.push({name,...body});const ok=p=>allow&&!p.startsWith('other/');
  return{data:{paths:Object.fromEntries(body.paths.filter(ok).map(p=>[p,{url:'https://project.invalid/storage/v1/object/sign/post-images/'+p+'?token=x',expires_at:now+1800}])),
   playback:Object.fromEntries(body.playback_ids.filter(()=>allow).map(id=>[id,{stream:'https://stream.mux.com/'+id+'.m3u8?token=v',poster:'https://image.mux.com/'+id+'/thumbnail.jpg?token=t',expires_at:now+1800}]))},error:null}};
 const media=load('private-media.ts',{'./supabase':{supabase:{functions:{invoke}}},'./session-identity':identity});
 const first=await media.resolvePrivateMedia({paths:['A/private-v1/1.jpg','other/private-v1/2.jpg'],playbackIds:['vid']});
 assert.equal(asked.length,1);assert.equal(asked[0].name,'private-media');
 assert.equal(first.paths.get('A/private-v1/1.jpg').includes('/object/sign/'),true);assert.equal(first.paths.has('other/private-v1/2.jpg'),false);
 assert.equal(first.playback.get('vid').stream,'https://stream.mux.com/vid.m3u8?token=v');
 // A refresh inside the link lifetime costs no request and keeps the same URL (no re-download, no player restart).
 const again=await media.resolvePrivateMedia({paths:['A/private-v1/1.jpg'],playbackIds:['vid']});
 assert.equal(asked.length,1);assert.equal(again.paths.get('A/private-v1/1.jpg'),first.paths.get('A/private-v1/1.jpg'));
 assert.equal(media.signedStoragePath(first.paths.get('A/private-v1/1.jpg')),'A/private-v1/1.jpg');
 // Account change forgets every link; the next account asks the server itself.
 identity.setSessionIdentity('B','token-b');allow=false;
 const b=await media.resolvePrivateMedia({paths:['A/private-v1/1.jpg'],playbackIds:['vid']});
 assert.equal(asked.length,2);assert.equal(b.paths.size,0);assert.equal(b.playback.size,0);
});
test('post audience preference is per-account and a delayed A preference cannot populate B',async()=>{
 const {identity}=harness();const saved=new Map();let delay=null;
 const audience=load('audience.ts',{'./session-identity':identity,react:{useSyncExternalStore:()=>{}},'expo-router':{router:{}},'@react-native-async-storage/async-storage':{getItem:async key=>delay?await new Promise(r=>delay=r):saved.get(key),setItem:async(k,v)=>saved.set(k,v)}});
 identity.setSessionIdentity('A','a');await audience.savePostAudience('close_friends');identity.setSessionIdentity('B','b');assert.equal(await audience.loadPostAudience(),'all_friends');
 identity.setSessionIdentity('A','a');assert.equal(await audience.loadPostAudience(),'close_friends');
 delay=true;const pending=audience.loadPostAudience();identity.setSessionIdentity('B','b');delay('close_friends');assert.equal(await pending,'all_friends');
});

test('account boundary clears private module stores before returning and changes the React tree key',()=>{
 const {identity}=harness();const calls=[];
 const mocks={react:{useSyncExternalStore:(_subscribe,get)=>get()},'react/jsx-runtime':{jsx:(type,props,key)=>({type,props,key})},'@/lib/session-identity':identity,'expo-image':{Image:{clearMemoryCache:()=>{calls.push('clearMemoryCache');return Promise.resolve(true)},clearDiskCache:()=>{calls.push('clearDiskCache');return Promise.resolve(true)}}}};
 for(const [module,names] of Object.entries({'post-detail':['resetPostDetail'],'audience':['clearAudienceRequest'],'tag-picker':['clearTagRequest'],'country-codes':['clearCountryRequest'],'toast':['dismissToast'],'night-status':['invalidateOutStatusCache'],'night-gate':['setNightGateState','takePendingDeepLink'],'map-filters':['resetMapFilters'],'tonight':['setActiveCity'],'venue-arrival-engine':['resetDwellTracker']}))mocks['@/lib/'+module]=Object.fromEntries(names.map(n=>[n,()=>calls.push(n)]));
 mocks['@/lib/background-location']={stopBackgroundLocation:()=>{calls.push('stopBackgroundLocation');return Promise.resolve()}};
 const scope=load('../components/account-scope.tsx',mocks);identity.setSessionIdentity('A','a');const a=scope.AccountScope({children:'private A'});calls.length=0;
 identity.setSessionIdentity('B','b');const b=scope.AccountScope({children:'B'});
 assert.notEqual(a.key,b.key);assert.equal(calls.length,14);assert(calls.includes('resetPostDetail'));
 // Disk-cached media of the previous account is never served to the next one.
 assert(calls.includes('clearMemoryCache'));assert(calls.includes('clearDiskCache'));assert(calls.includes('stopBackgroundLocation'));
});
test('post detail reset removes Account A content and callbacks without invoking them',()=>{
 let routed=0,privateCallback=0;
 const detail=load('post-detail.ts',{react:{useSyncExternalStore:()=>{}},'expo-router':{router:{push:()=>routed++}},'react-native-reanimated':{makeMutable:v=>({value:v}),withSpring:()=>{}},'react-native-worklets':{scheduleOnRN:()=>{}}});
 detail.openPostDetail({mode:'sheet',post:{id:'A-private'},isLiked:false,toggleLike:()=>privateCallback++,deletePost:()=>privateCallback++});
 assert.equal(detail.getPostDetailState().post.id,'A-private');detail.resetPostDetail();
 const state=detail.getPostDetailState();assert.equal(state.post,null);assert.equal(state.toggleLike,null);assert.equal(state.deletePost,null);assert.equal(privateCallback,0);assert.equal(routed,1);
});
