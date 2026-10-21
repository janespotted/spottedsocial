const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./product-test-runtime.cjs');
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
function links(){const memory=new Map();const api=load('lib/invitation-links.ts',{
 'react-native-url-polyfill':{URL},'@react-native-async-storage/async-storage':{
  getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v),removeItem:async k=>memory.delete(k)
 }});return {api,memory};}
test('invitation links accept exact app/site paths and reject foreign or malformed destinations',()=>{
 const {api}=links();for(const url of ['spotted://invite/ABCDEFGH','spotted://app/invite/abcdefgh','/invite/ABCDEFGH','https://spottedsocial.vercel.app/invite/ABCDEFGH'])assert.equal(api.invitationCodeFromLink(url),'ABCDEFGH');
 for(const url of ['https://evil.test/invite/ABCDEFGH','https://spottedsocial.vercel.app.evil.test/invite/ABCDEFGH','https://user@spottedsocial.vercel.app/invite/ABCDEFGH','javascript://invite/ABCDEFGH','spotted://invite/ABC/DEFGH','spotted://invite/%','spotted://invite/ABCDEFG0','spotted://invite/ABCDEFGH/extra'])assert.equal(api.invitationCodeFromLink(url),null,url);
});
test('invitation survives onboarding, binds to the signed-in account, and cannot cross accounts',async()=>{
 const {api}=links();await api.rememberInvitation('abcdefgh');assert.equal((await api.claimInvitation(owner)).code,'ABCDEFGH');
 assert.equal((await api.claimInvitation(owner)).owner,owner);assert.equal(await api.claimInvitation(other),null);assert.equal(await api.claimInvitation(owner),null);
});
test('clearing an old invitation cannot erase a newer link and stale data is discarded',async()=>{
 const {api,memory}=links();await api.rememberInvitation('ABCDEFGH');await api.claimInvitation(owner);await api.rememberInvitation('JKLMNPQR');await api.claimInvitation(owner);
 await api.clearInvitation('ABCDEFGH',owner);assert.equal((await api.claimInvitation(owner)).code,'JKLMNPQR');
 await api.clearInvitation('JKLMNPQR',owner);assert.equal(await api.claimInvitation(owner),null);
 memory.set('spotted.pending-invitation.v1',JSON.stringify({code:'ABCDEFGH',owner,expires:0}));assert.equal(await api.claimInvitation(owner),null);
 memory.set('spotted.pending-invitation.v1','invalid');assert.equal(await api.claimInvitation(owner),null);
});
test('foreground suppression is restricted to the visible conversation and matching account',()=>{
 const api=load('lib/conversation-notifications.ts',{'./supabase':{},'./demo-mode':{isDemoMode:()=>false}});
 const releaseOld=api.focusConversation(owner,'dm','thread-a');
 assert.equal(api.isVisibleConversation(owner,{type:'dm',data:{thread_id:'thread-a'}}),true);
 assert.equal(api.isVisibleConversation(other,{type:'dm',data:{thread_id:'thread-a'}}),false);
 assert.equal(api.isVisibleConversation(owner,{type:'friend_out',data:{thread_id:'thread-a'}}),false);
 const release=api.focusConversation(owner,'plan','plan-b');releaseOld();
 assert.equal(api.isVisibleConversation(owner,{type:'plan_comment',data:{plan_id:'plan-b'}}),true);release();
 assert.equal(api.isVisibleConversation(owner,{type:'plan_comment',data:{plan_id:'plan-b'}}),false);
});
test('native invitation intent is saved before auth routing; venue handoff is preserved',async()=>{
 const events=[];const api=load('app/+native-intent.tsx',{
  '@/lib/invitation-links':{invitationCodeFromLink:p=>p.includes('/invite/')?'ABCDEFGH':null,rememberInvitation:async code=>events.push(['invite',code])},
  '@/lib/venue-links':{venueIdFromLink:p=>p.includes('venue-link')?'venue-a':null,rememberSharedVenue:async id=>events.push(['venue',id])}
 });
 assert.equal(await api.redirectSystemPath({path:'/invite/ABCDEFGH',initial:true}),'/');
 assert.equal(await api.redirectSystemPath({path:'/venue-link?venueId=venue-a',initial:false}),'/');
 assert.deepEqual(events,[['invite','ABCDEFGH'],['venue','venue-a']]);
 assert.equal(await api.redirectSystemPath({path:'/friends',initial:false}),'/friends');
});
