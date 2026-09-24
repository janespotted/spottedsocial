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
test('media endpoint uses current identity, never sends app credentials to external URLs',()=>{
 const {identity}=harness();identity.setSessionIdentity('A','token-a');
 const media=load('private-media.ts',{'./supabase':{SUPABASE_URL:'https://project.invalid',SUPABASE_PUBLISHABLE_KEY:'public-key'},'./session-identity':identity});
 const raw='https://project.invalid/storage/v1/object/public/post-images/A/photo.jpg';
 const a=media.privateMediaSource(raw);assert.equal(a.headers.Authorization,'Bearer token-a');assert(a.uri.includes('/functions/v1/private-media?'));
 identity.setSessionIdentity('B','token-b');const b=media.privateMediaSource(raw);
 assert.equal(b.headers.Authorization,'Bearer token-b');assert.notEqual(a.cacheKey,b.cacheKey);
 assert.equal(media.privateMediaSource('https://external.invalid/demo.jpg').headers,undefined);
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
 const mocks={react:{useSyncExternalStore:(_subscribe,get)=>get()},'react/jsx-runtime':{jsx:(type,props,key)=>({type,props,key})},'@/lib/session-identity':identity};
 for(const [module,names] of Object.entries({'post-detail':['resetPostDetail'],'audience':['clearAudienceRequest'],'tag-picker':['clearTagRequest'],'country-codes':['clearCountryRequest'],'toast':['dismissToast'],'night-status':['invalidateOutStatusCache'],'night-gate':['setNightGateState','takePendingDeepLink'],'map-filters':['resetMapFilters'],'tonight':['setActiveCity'],'venue-arrival-engine':['resetDwellTracker']}))mocks['@/lib/'+module]=Object.fromEntries(names.map(n=>[n,()=>calls.push(n)]));
 mocks['@/lib/background-location']={stopBackgroundLocation:()=>{calls.push('stopBackgroundLocation');return Promise.resolve()}};
 const scope=load('../components/account-scope.tsx',mocks);identity.setSessionIdentity('A','a');const a=scope.AccountScope({children:'private A'});calls.length=0;
 identity.setSessionIdentity('B','b');const b=scope.AccountScope({children:'B'});
 assert.notEqual(a.key,b.key);assert.equal(calls.length,12);assert(calls.includes('resetPostDetail'));assert(calls.includes('stopBackgroundLocation'));
});
test('post detail reset removes Account A content and callbacks without invoking them',()=>{
 let routed=0,privateCallback=0;
 const detail=load('post-detail.ts',{react:{useSyncExternalStore:()=>{}},'expo-router':{router:{push:()=>routed++}},'react-native-reanimated':{makeMutable:v=>({value:v}),withSpring:()=>{}},'react-native-worklets':{scheduleOnRN:()=>{}}});
 detail.openPostDetail({mode:'sheet',post:{id:'A-private'},isLiked:false,toggleLike:()=>privateCallback++,deletePost:()=>privateCallback++});
 assert.equal(detail.getPostDetailState().post.id,'A-private');detail.resetPostDetail();
 const state=detail.getPostDetailState();assert.equal(state.post,null);assert.equal(state.toggleLike,null);assert.equal(state.deletePost,null);assert.equal(privateCallback,0);assert.equal(routed,1);
});
