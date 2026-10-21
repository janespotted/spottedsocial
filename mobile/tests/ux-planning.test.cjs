const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./product-test-runtime.cjs');
const nav=load('lib/plan-navigation.ts');
const id='00000000-0000-4000-8000-000000000123';
const push=load('lib/push.ts',{'@react-native-async-storage/async-storage':{},'react-native':{},'expo-notifications':{},'./supabase':{},'./plan-navigation':nav});
test('plan invitations, responses and chat alerts open the exact plan; malformed sources use Plans',()=>{
 for(const type of ['plan_invite','plan_down','plan_comment']){
  const route=push.routeForNotification({type,data:{plan_id:id}});assert.equal(route.pathname,'/plan-detail');assert.equal(route.params.planId,id);
  assert.equal(push.routeForNotification({type,data:{plan_id:'../private'}}),'/messages?tab=plans');
 }
});
test('venue activity opens the named venue; no venue uses the sender profile without inventing attendance',()=>{
 const route=push.routeForNotification({type:'friend_out',data:{status_venue_id:id}});assert.equal(route.pathname,'/venue');assert.equal(route.params.venueId,id);
 assert.equal(push.routeForNotification({type:'friend_planning',data:{actor_id:id}}).pathname,'/friend-card');
 assert.equal(push.routeForNotification({url:'/check-in-anything'}),'/activity');
});
function links(){const memory=new Map();const api=load('lib/venue-links.ts',{'react-native-url-polyfill':{URL},'./plan-navigation':nav,'@react-native-async-storage/async-storage':{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v),removeItem:async k=>memory.delete(k)}});return {api,memory};}
test('venue handoff accepts only the known app/site, and only a valid venue destination',()=>{
 const {api}=links();for(const url of [`spotted://venue-link?venueId=${id}`,`/venue-link?venueId=${id}`,`https://spottedsocial.vercel.app/venue-link?venueId=${id}`])assert.equal(api.venueIdFromLink(url),id);
 for(const url of [`https://evil.test/venue-link?venueId=${id}`,`javascript://venue-link?venueId=${id}`,`spotted://thread?venueId=${id}`,'spotted://venue-link?venueId=bad'])assert.equal(api.venueIdFromLink(url),null);
});
test('shared venue survives login handoff, consumes once, and expired/corrupt context is ignored',async()=>{
 const {api,memory}=links();let notifications=0;const stop=api.subscribeSharedVenue(()=>notifications++);await api.rememberSharedVenue(id);assert.equal(notifications,1);assert.equal(await api.consumeSharedVenue(),id);assert.equal(await api.consumeSharedVenue(),null);stop();
 memory.set('spotted.pending-venue.v1',JSON.stringify({id,expires:0}));assert.equal(await api.consumeSharedVenue(),null);memory.set('spotted.pending-venue.v1','bad json');assert.equal(await api.consumeSharedVenue(),null);
});
test('plan chat copy uses the morning after the plan date across month/year boundaries',()=>{
 assert.match(nav.planChatExpiryLabel('2026-12-31'),/Jan 1/);assert.match(nav.planChatExpiryLabel('2026-10-31'),/Nov 1/);assert.equal(nav.planChatExpiryLabel('invalid'),'This chat stays until the plan ends.');
});

test('cancelled and concurrent venue handoffs retain or consume the destination exactly once',async()=>{
 const {api}=links();await api.rememberSharedVenue(id);
 assert.equal(await api.consumeSharedVenue(()=>false),null);
 let opened=0;const accept=()=>{opened++;return true;};
 assert.deepEqual(await Promise.all([api.consumeSharedVenue(accept),api.consumeSharedVenue(accept)]),[id,null]);
 assert.equal(opened,1);
});
