const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loadModule(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib',file),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const mod={exports:{}};
  new Function('require','module','exports',code)((id)=>{
    if (!(id in dependencies)) throw new Error(`Missing test dependency ${id}`);
    return dependencies[id];
  },mod,mod.exports);
  return mod.exports;
}
const quality=loadModule('location-quality.ts',{});
function harness() {
  const memory=new Map(); const requests=[]; const listeners={}; const arrivals=[];
  let reply={status:'accepted',needs_sample:false};
  let handler; let starts=0; let stops=0; let permission='always'; let failure=false; let hold=null;
  let nativeFix=null;
  let own={status:'out',is_private_party:false,updated_at:new Date(Date.now()-60000).toISOString(),
    expires_at:new Date(Date.now()+3600000).toISOString(),automatic_venue_updates:true};
  const sdk={
    start:async()=>{starts++;return {enabled:true};},stop:async()=>{stops++;},
    getCurrentPosition:async()=>{ if(!nativeFix) throw new Error('No GPS'); handler(nativeFix);return nativeFix; },
    watchPosition:async()=>({remove(){}}),
    getProviderState:async()=>({enabled:true,status:3}),
    getState:async()=>({enabled:true,isMoving:false}),changePace:async()=>{},
    onActivityChange:cb=>{listeners.activity=cb;},
    onMotionChange:cb=>{listeners.motion=cb;},onConnectivityChange:cb=>{listeners.network=cb;},
    onProviderChange:cb=>{listeners.provider=cb;},
  };
  const storage={getItem:async key=>memory.get(key)??null,setItem:async(key,val)=>{memory.set(key,val);},removeItem:async key=>{memory.delete(key);}};
  const api=loadModule('background-location.ts',{
    'react-native':{AppState:{currentState:'active'}},
    '@react-native-async-storage/async-storage':storage,
    'react-native-background-geolocation':sdk,
    '@transistorsoft/background-geolocation-types':{DesiredAccuracy:{High:0},AuthorizationStatus:{Always:3,WhenInUse:4}},
    'expo-notifications':{scheduleNotificationAsync:async()=>{}},
    './supabase':{supabase:{rpc:(name,args)=>{
      requests.push({name,args});
      return {abortSignal:()=>hold??Promise.resolve(failure?{error:new Error('offline')}:{data:reply,error:null})};
    },from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{display_name:'Alice'}})})})})}},
    './night-status':{fetchOwnNightStatus:async()=>own},
    './query-client':{queryClient:{invalidateQueries:async()=>{}}},
    './location-quality':quality,
    './notifications':{notifyFriendArrived:async(...args)=>arrivals.push(args)},
    './location-ready':{
      automaticUpdatesEnabled:async()=>true, configureTrackingDeadline:async()=>{}, ensureLocationReady:async()=>{},
      getLocationPermission:async()=>permission, hasLocationAccess:p=>['always','when_in_use'].includes(p),
      requestAutomaticUpdates:async()=>permission,setLocationHandler:cb=>{handler=cb;},
    },
  });
  const fix=(patch={})=>({timestamp:new Date().toISOString(),coords:{latitude:40.72,longitude:-73.99,accuracy:10,speed:0},...patch});
  return {api,memory,requests,listeners,fix,arrivals,setReply:value=>{reply=value;},emit:value=>handler(value),
    setFix:v=>{nativeFix=v;},setFailure:v=>{failure=v;},setHold:v=>{hold=v;},setOwn:v=>{own=v;},
    get starts(){return starts;},get stops(){return stops;},get own(){return own;}};
}
test('failed foreground GPS does not mark an old location fresh',async t=>{
  const h=harness();t.after(()=>h.api.stopBackgroundLocation());
  await h.api.startBackgroundLocation('a');
  await h.api.recordPresenceHeartbeat('a');
  assert.equal(h.requests.length,0);
});
test('duplicates and inaccurate GPS never inflate writes or dwell samples',async t=>{
  const h=harness();t.after(()=>h.api.stopBackgroundLocation());await h.api.startBackgroundLocation('a');
  const f=h.fix();h.emit(f);h.emit(f);
  h.emit(h.fix({coords:{...f.coords,accuracy:200}}));
  await h.api.retryPendingLocation();
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].args.p_recorded_at,f.timestamp);
});
test('offline retry keeps the real capture timestamp and only the latest sample',async t=>{
  const h=harness();t.after(()=>h.api.stopBackgroundLocation());await h.api.startBackgroundLocation('a');
  h.setFailure(true);const f=h.fix();h.emit(f);await h.api.retryPendingLocation();
  assert.ok(h.memory.has('spotted.location.pending.v1.a'));
  h.setFailure(false);await h.api.retryPendingLocation();
  assert.equal(h.requests.at(-1).args.p_recorded_at,f.timestamp);
  assert.equal(h.memory.has('spotted.location.pending.v1.a'),false);
});
test('one-shot GPS after stopping cannot re-share location',async()=>{
  const h=harness();await h.api.startBackgroundLocation('a');await h.api.stopBackgroundLocation();
  h.setFix(h.fix());await h.api.getCurrentPosition();await h.api.retryPendingLocation();
  assert.equal(h.requests.length,0);
});
test('explicit stop stays locally off even when the server still says Out',async t=>{
  const h=harness();t.after(()=>h.api.stopBackgroundLocation());await h.api.startBackgroundLocation('a');
  await h.api.pauseLocationForStatusChange('a');
  assert.equal((await h.api.startBackgroundLocation('a')).tracking,false);
  assert.equal(h.starts,1);
  await h.api.allowLocationAfterCheckin('a');
  assert.equal((await h.api.startBackgroundLocation('a')).tracking,true);
});
test('stopping drains an in-flight upload before the caller clears the profile',async()=>{
  const h=harness();await h.api.startBackgroundLocation('a');let release;
  h.setHold(new Promise(resolve=>{release=resolve;}));h.emit(h.fix());
  await new Promise(resolve=>setImmediate(resolve));
  let stopped=false;const ending=h.api.stopBackgroundLocation().then(()=>{stopped=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(stopped,false);
  release({data:{status:'accepted'},error:null});await ending;
  assert.equal(stopped,true);assert.equal(h.memory.has('spotted.location.pending.v1.a'),false);
});
test('expired nights and private parties never start native GPS',async()=>{
  for (const patch of [{expires_at:new Date(Date.now()-1000).toISOString()},{is_private_party:true},{status:'planning'}]) {
    const h=harness();h.setOwn({...h.own,...patch});
    assert.equal((await h.api.startBackgroundLocation('a')).tracking,false);assert.equal(h.starts,0);
    await h.api.stopBackgroundLocation();
  }
});

test('only confirmed automatic arrivals notify friends, not departure or ambiguous fixes',async t=>{
  for(const reply of [{status:'accepted',departed:true},{status:'accepted',needs_sample:true},{status:'accepted',venue_changed:true,venue_id:'bar-b',venue_name:'Bar B'}]){
    const h=harness();await h.api.startBackgroundLocation('a');h.setReply(reply);h.emit(h.fix());await h.api.retryPendingLocation();await new Promise(r=>setImmediate(r));
    assert.equal(h.arrivals.length,reply.venue_changed?1:0);await h.api.stopBackgroundLocation();
  }
});
