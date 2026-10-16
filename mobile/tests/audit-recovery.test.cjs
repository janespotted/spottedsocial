const test = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./product-test-runtime.cjs');
const { QueryClient } = require('@tanstack/react-query');
function accountHarness(getUser, session = {user:{id:'account-a'}}) {
 const { useAuthAccount } = load('hooks/use-auth-account.ts', {
  '@tanstack/react-query': { useQuery: options => options },
  '@/lib/supabase': {supabase:{auth:{getUser}}},
  './use-session': {useSession:()=>({session})},
 });
 return useAuthAccount();
}
test('Sign-in account lookup fails honestly and can recover by retrying the same query', async () => {
 let online = false; const expected = {id:'account-a',phone:'12025550101',identities:[{provider:'apple'}]};
 const options = accountHarness(async()=>online ? {data:{user:expected},error:null} : {data:{user:null},error:new Error('Network unavailable')});
 const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 try {
  await assert.rejects(client.fetchQuery(options), /Network unavailable/);
  assert.equal(client.getQueryState(options.queryKey).status,'error');
  assert.equal(client.getQueryData(options.queryKey),undefined);
  online = true;
  assert.deepEqual(await client.fetchQuery(options),expected);
  assert.equal(client.getQueryState(options.queryKey).status,'success');
 } finally {client.clear();}
});
test('An empty auth response is not interpreted as an account without sign-in methods', async () => {
 const options = accountHarness(async()=>({data:{user:null},error:null}));
 await assert.rejects(options.queryFn(), /Couldn’t load your sign-in methods/);
});
test('Failed account refresh keeps the previously confirmed identities for an explicit stale-data state', async () => {
 let fail = false; const expected={id:'account-a',phone:'12025550101',identities:[{provider:'apple'}]};
 const options=accountHarness(async()=>fail ? {data:{user:null},error:new Error('Offline')} : {data:{user:expected},error:null});
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 try {
  await client.fetchQuery(options); fail=true;
  await assert.rejects(client.fetchQuery({...options,staleTime:0}), /Offline/);
  assert.deepEqual(client.getQueryData(options.queryKey),expected);
  assert.equal(client.getQueryState(options.queryKey).status,'error');
 } finally {client.clear();}
});
test('Recap direct links and missing photo boundaries stay visible at every transition progress', () => {
 const transition = load('lib/recap-transitions.ts', {
  'react-native-reanimated': {makeMutable:value=>({value}),interpolate:()=>1},
  'react-native-screen-transitions': {__esModule:true,default:{Specs:{Zoom:{}}},NAVIGATION_MASK_ELEMENT_STYLE_ID:'mask'},
  '@/lib/theme': {INK:'#110a24'},
 });
 for(const progress of [0,0.5,1,2]) {
  const frame={progress,layouts:{screen:{width:375,height:667}},bounds:()=>({link:()=>null})};
  for(const id of [null,'expired-photo']) {
   transition.recapActivePhotoId.value=id;
   const styles=transition.photoViewerOptions.screenStyleInterpolator(frame);
   assert.equal(styles.content.style.opacity,1);
   assert.deepEqual(JSON.parse(JSON.stringify(styles.content.style.transform)),[{translateX:0},{translateY:0},{scale:1}]);
   assert.equal(styles.mask.style.width,375);assert.equal(styles.mask.style.height,667);
  }
 }
 transition.recapActivePhotoId.value='visible-photo';let selected;
 const styles=transition.photoViewerOptions.screenStyleInterpolator({bounds:tag=>{selected=tag;return {link:()=>({source:{bounds:{width:80,height:100}}}),navigation:{zoom:()=>({realZoom:true})}}}});
 assert.equal(styles.realZoom,true);assert.equal(selected.id,'visible-photo');
});
