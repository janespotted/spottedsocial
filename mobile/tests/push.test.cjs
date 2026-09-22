const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps) {
  const js=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports',js)(name=>{if(!(name in deps))throw Error('Missing '+name);return deps[name];},mod,mod.exports);
  return mod.exports;
}
const tick=()=>new Promise(r=>setImmediate(r));
function harness() {
  const memory=new Map();const calls=[];const alerts=[];
  const state={uid:'alice',permission:'granted',rpcError:false,saveError:false,clearError:false,zeroRows:false,hold:null,nativeToken:'a'.repeat(64),profileToken:null};
  const request=(work)=>({abortSignal:()=>Promise.resolve().then(work)});
  const db={auth:{getSession:async()=>({data:{session:state.uid?{user:{id:state.uid}}:null}}),signOut:async opts=>{calls.push(['signOut',opts]);state.uid=null;return {error:null};}},
    rpc:()=>request(()=>{calls.push(['detachOthers']);return {error:state.rpcError?Error('RPC failed'):null};}),
    from:()=>{let values;const filters=[];const q={update:v=>{values=v;return q;},select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q;},maybeSingle:()=>q,
      abortSignal:async()=>{
        if(!values)return {data:[{apns_device_token:state.profileToken}],error:null};
        if(values.apns_device_token===null){calls.push(['clear',filters]);return {error:state.clearError?Error('offline'):null};}
        calls.push(['save',values]);if(state.hold)await state.hold;
        return {error:state.saveError?Error('save failed'):null,data:state.zeroRows?[]:[{id:state.uid}]};
      }};return q;}};
  const sdk={getPermissionsAsync:async()=>({status:state.permission,canAskAgain:true}),requestPermissionsAsync:async()=>({status:state.permission}),getDevicePushTokenAsync:async()=>({data:state.nativeToken}),
    dismissAllNotificationsAsync:async()=>calls.push(['dismiss']),cancelAllScheduledNotificationsAsync:async()=>{},clearLastNotificationResponseAsync:async()=>{},setBadgeCountAsync:async()=>{}};
  const api=load('lib/push.ts',{'expo-notifications':sdk,'./supabase':{supabase:db},'react-native':{Alert:{alert:(...a)=>alerts.push(a)}},'@react-native-async-storage/async-storage':{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v),removeItem:async k=>memory.delete(k)}});
  return {api,state,calls,alerts,memory};
}
test('failed token detachment and save reject instead of returning granted',async()=>{
 for(const failure of ['rpcError','saveError','zeroRows']){const h=harness();h.state[failure]=true;await assert.rejects(h.api.registerPushToken('alice',{prompt:false}));}
});
test('registration retries successfully after a failed save',async()=>{
 const h=harness();h.state.saveError=true;await assert.rejects(h.api.registerPushToken('alice',{prompt:false}));h.state.saveError=false;
 assert.equal(await h.api.registerPushToken('alice',{prompt:false}),'granted');assert.equal(h.calls.filter(c=>c[0]==='save').length,2);
});
test('denied permission and changed account never register a device',async()=>{
 const h=harness();h.state.permission='denied';assert.equal(await h.api.registerPushToken('alice',{prompt:false}),'denied');assert.equal(h.calls.length,0);
 h.state.uid='bob';await assert.rejects(h.api.registerPushToken('alice',{prompt:false}));assert.equal(h.calls.length,0);
});
test('rotated token is saved without asking native registration for another token',async()=>{
 const h=harness();const rotated='b'.repeat(64);await h.api.registerPushToken('alice',{prompt:false,token:rotated});assert.equal(h.calls.find(c=>c[0]==='save')[1].apns_device_token,rotated);
});
test('logout drains in-flight registration, detaches only this token, then signs out',async()=>{
 const h=harness();let release;h.state.hold=new Promise(r=>release=r);const registering=h.api.registerPushToken('alice',{prompt:false});await tick();
 const ending=h.api.signOutWithPushCleanup();await assert.rejects(h.api.registerPushToken('alice',{prompt:false}));await tick();assert.equal(h.calls.some(c=>c[0]==='signOut'),false);
 release();await registering;await ending;
 assert.deepEqual(h.calls.filter(c=>['save','clear','signOut'].includes(c[0])).map(c=>c[0]),['save','clear','signOut']);
 assert.deepEqual(h.calls.find(c=>c[0]==='clear')[1],[['id','alice'],['apns_device_token','a'.repeat(64)]]);
 assert.deepEqual(h.calls.find(c=>c[0]==='signOut')[1],{scope:'local'});
});
test('offline cleanup failure does not falsely sign out and can be retried',async()=>{
 const h=harness();h.state.clearError=true;await h.api.signOutWithPushCleanup();assert.equal(h.state.uid,'alice');assert.equal(h.alerts.length,1);
 h.state.clearError=false;await h.api.signOutWithPushCleanup();assert.equal(h.state.uid,null);
});
test('legacy and canonical arrival taps route to map; local arrival opens correction',()=>{
 const h=harness();for(const type of ['friend_arrived','friend_arrived_venue'])assert.equal(h.api.routeForNotification({type}),'/map');
 assert.equal(h.api.routeForNotification({url:'/check-in'}),'/check-in');assert.equal(h.api.routeForNotification({type:'dm'}),'/messages');
});
function managerHarness({gate='answered',initial=null,failRegistration=false}={}) {
 const effects=[];const callbacks={};const destinations=[];const parked=[];const registrations=[];const timers=new Map();let next=0;let failures=failRegistration?1:0;
 const sdk={DEFAULT_ACTION_IDENTIFIER:'default',setNotificationHandler:handler=>{callbacks.presentation=handler.handleNotification;},clearLastNotificationResponseAsync:async()=>{},getLastNotificationResponseAsync:async()=>initial,
 addNotificationResponseReceivedListener:cb=>{callbacks.tap=cb;return {remove(){}};},addPushTokenListener:cb=>{callbacks.token=cb;return {remove(){}};}};
 const native={AppState:{currentState:'active',addEventListener:(_,cb)=>{callbacks.app=cb;return {remove(){}};}}};
 const deps={'react':{useEffect:fn=>effects.push(fn),useRef:value=>({current:value})},'react-native':native,'expo-router':{router:{push:v=>destinations.push(v)}},'expo-notifications':sdk,
 '@react-native-community/netinfo':{addEventListener:cb=>{callbacks.network=cb;return ()=>{};}},
 '@/lib/night-gate':{deferDeepLink:v=>parked.push(v),getNightGateState:()=>gate,takePendingDeepLink:()=>null},
 '@/lib/push':{registerPushToken:async(uid,opts)=>{registrations.push(opts);if(failures-->0)throw Error('offline');return 'granted';},routeForNotification:data=>data?.type==='dm'?'/messages':'/map'},
 '@/hooks/use-session':{useSession:()=>({session:{user:{id:'alice'}},onboardingNeeded:false,onboardingResolved:true})}};
 const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/push-notification-manager.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{}};new Function('require','module','exports','setTimeout','clearTimeout',compiled)(n=>deps[n],mod,mod.exports,(fn,ms)=>{timers.set(++next,{fn,ms});return next;},id=>timers.delete(id));
 mod.exports.PushNotificationManager();const cleanups=effects.map(fn=>fn());
 return {callbacks,destinations,parked,registrations,timers,cleanup:()=>cleanups.forEach(f=>f?.())};
}
const response=(receiver='alice')=>({actionIdentifier:'default',notification:{request:{identifier:'one',content:{data:{type:'dm',receiver_id:receiver}}}}});
test('cold-start notification is consumed once even when listener repeats it',async()=>{
 const r=response();const h=managerHarness({initial:r});await tick();h.callbacks.tap(r);assert.deepEqual(h.destinations,['/messages']);h.cleanup();
});
test('night gate defers notification route and wrong-account notifications are discarded',async()=>{
 const h=managerHarness({gate:'open',initial:response()});await tick();assert.deepEqual(h.parked,['/messages']);assert.deepEqual(h.destinations,[]);h.cleanup();
 const other=managerHarness({initial:response('bob')});await tick();assert.deepEqual(other.destinations,[]);other.cleanup();
});
test('registration recovers on reconnect, foreground and token rotation',async()=>{
 const h=managerHarness({failRegistration:true});await tick();assert.equal(h.timers.size,1);
 h.callbacks.network({isConnected:true});await tick();assert.equal(h.timers.size,0);
 h.callbacks.app('active');await tick();h.callbacks.token({data:'b'.repeat(64)});await tick();
 assert.equal(h.registrations.length,4);assert.equal(h.registrations.at(-1).token,'b'.repeat(64));h.cleanup();
});
function serverHarness() {
 const file=path.join(__dirname,'../../supabase/functions/send-push/index.ts');
 const source=fs.readFileSync(file,'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const out={};const sent=[];
 new Function('require','exports','Deno','fetch','console',code+'\nexports.validatePayload=validatePayload; exports.getNotificationContent=getNotificationContent; exports.sendApnsPushToHost=sendApnsPushToHost;')(
 ()=>({createClient:()=>{throw Error('No database calls permitted');}}),out,{serve:()=>{}},async(url,opts)=>{sent.push({url,...opts});return {ok:true,status:200,text:async()=>''};},{log(){},error(){}});
 return {api:out,sent};
}
test('server accepts old and new friend-arrival clients and rejects unknown types',()=>{
 const h=serverHarness();const input={notification_id:'test',sender_id:'11111111-1111-4111-8111-111111111111',receiver_id:'22222222-2222-4222-8222-222222222222',message:'Alice arrived'};
 for(const type of ['friend_arrived','friend_arrived_venue','dm','venue_invite'])assert.equal(h.api.validatePayload({...input,type}).valid,true);
 assert.equal(h.api.validatePayload({...input,type:'invalid'}).valid,false);
 assert.equal(h.api.getNotificationContent('friend_arrived','Alice arrived').title,h.api.getNotificationContent('friend_arrived_venue','Alice arrived').title);
});
test('APNs payload includes recipient and notification ID for safe tap handling',async()=>{
 const h=serverHarness();await h.api.sendApnsPushToHost('synthetic-token',{title:'Hi',body:'Hello',type:'dm',receiver_id:'alice',notification_id:'one'},'mock.invalid','fake-jwt','test.bundle');
 const payload=JSON.parse(h.sent[0].body);assert.equal(payload.receiver_id,'alice');assert.equal(payload.notification_id,'one');assert.equal(payload.aps.alert.body,'Hello');
});
test('foreground alert from another account is suppressed',async()=>{
 const h=managerHarness();await tick();
 assert.equal((await h.callbacks.presentation(response('bob').notification)).shouldShowBanner,false);
 assert.equal((await h.callbacks.presentation(response('alice').notification)).shouldShowBanner,true);
 h.cleanup();
});
