const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./product-test-runtime.cjs');
const {extract}=require('./product-test-runtime.cjs');
test('Every app route group is explicitly protected for incomplete and signed-out accounts',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const groups=fs.readdirSync(path.join(__dirname,'../src/app')).filter(n=>n.startsWith('('));
 let sessionState;
 const element=(type,props)=>({type,props});
 const render=extract('app/_layout.tsx','RootNavigator',{
  useSession:()=>sessionState,useResolveClassNames:()=>'',SCREEN_GRADIENT:'',SHEET_CONTENT_STYLE:{},
  Stack:Object.assign('Stack',{Screen:'Screen',Protected:'Protected'}),
  require:()=>({jsx:element,jsxs:element}),
 });
 const collect=(node,includeHidden=false)=>{
  if(!node||typeof node!=='object')return [];
  if(node.type==='Screen')return [node.props.name];
  if(node.type==='Protected'&&!node.props.guard&&!includeHidden)return [];
  return [node.props?.children].flat(Infinity).flatMap(n=>collect(n,includeHidden));
 };
 for(const signedIn of [false,true])for(const onboardingNeeded of [false,true]){
  sessionState={session:signedIn?{user:{id:'alice'}}:null,loading:false,onboardingNeeded};
  const tree=render();
  for(const group of groups){
   assert.ok(collect(tree,true).includes(group),`${group} would otherwise be implicitly added outside the guard`);
   assert.equal(collect(tree).includes(group),signedIn&&!onboardingNeeded,group);
  }
 }
});
const api=load('lib/launch.ts',{'@/lib/supabase':{supabase:{}}});
test('Nomination normalization accepts US and explicit international numbers without guessing',()=>{
 for(const [input,expected] of [['(202) 555-0101','+12025550101'],['1 202 555 0101','+12025550101'],['+44 7700 900123','+447700900123'],['+92 300 5550101','+923005550101'],['abc2025550101',null],['5550101',null],['02012345678',null],['+000123456',null]])assert.equal(api.nominationPhone(input),expected,input);
});
test('Server completion is the only way past required nominations',()=>{
 const base={admitted:false,profileSaved:false,complete:false,nominations:[]};
 assert.equal(api.launchStage(base),'waiting');assert.equal(api.launchStage({...base,admitted:true}),'profile');
 for(const nominations of [[],[{slot:1}],[{slot:1},{slot:2}]]) assert.equal(api.launchStage({...base,admitted:true,profileSaved:true,nominations}),'nominate');
 assert.equal(api.launchStage({...base,admitted:true,profileSaved:true,complete:true}),'complete');
});
test('Failed network or duplicate response never confirms a nomination',async()=>{
 for(const result of [{data:null,error:{message:'offline'}},{data:{error:'Already queued'},error:null}]) {
  const rpc=load('lib/launch.ts',{'@/lib/supabase':{supabase:{rpc:async()=>result}}});
  await assert.rejects(rpc.launchRpc('save_launch_nomination',{p_slot:1,p_phone:'+12025550101'}));
 }
});
test('Saved demo preference is ineffective until trusted authorization and clears on account change',async()=>{
 const demo=load('lib/demo-mode.ts',{react:{useSyncExternalStore:()=>{}},'@react-native-async-storage/async-storage':{getItem:async()=> '1',setItem:async()=>{}}});
 await demo.hydrateDemoMode();assert.equal(demo.isDemoMode(),false);demo.setDemoAuthorization(true);assert.equal(demo.isDemoMode(),true);demo.setDemoAuthorization(false);assert.equal(demo.isDemoMode(),false);await demo.setDemoMode(true);assert.equal(demo.isDemoMode(),false);
});
test('Wave activation survives lost replies and a screen restart without opening another batch',async()=>{
 const saved=new Map(),calls=[];let fail=true;
 const mocks={'@react-native-async-storage/async-storage':{getItem:async k=>saved.get(k)||null,setItem:async(k,v)=>saved.set(k,v),removeItem:async k=>saved.delete(k)},'expo-crypto':{randomUUID:()=> '00000000-0000-4000-8000-000000000090'},'@/lib/launch':{launchRpc:async(name,args)=>{calls.push(args);if(fail)throw Error('reply lost');return {pending:0};}}};
 let wave=load('lib/launch-wave.ts',mocks);await assert.rejects(wave.activateWave('admin',100));assert.equal(saved.size,1);
 wave=load('lib/launch-wave.ts',mocks);fail=false;await wave.activateWave('admin',200);
 assert.equal(calls[0].p_request,calls[1].p_request);assert.equal(calls[1].p_count,100);assert.equal(saved.size,0);
});
test('Wave write does not start when its recovery key cannot be persisted',async()=>{
 let calls=0;const wave=load('lib/launch-wave.ts',{'@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async()=>{throw Error('disk unavailable')}},'expo-crypto':{randomUUID:()=> '00000000-0000-4000-8000-000000000090'},'@/lib/launch':{launchRpc:async()=>{calls++}}});
 await assert.rejects(wave.activateWave('admin',100));assert.equal(calls,0);
});

test('Invited Apple users must verify a phone before the waiting/profile screens',()=>{
 const base={admitted:false,profileSaved:false,complete:false,hasPhone:false,phoneRequired:true,nominations:[]};
 assert.equal(api.launchStage(base),'phone');
 assert.equal(api.launchStage({...base,admitted:true}),'phone');
 assert.equal(api.launchStage({...base,hasPhone:true}),'waiting');
 assert.equal(api.launchStage({...base,hasPhone:true,admitted:true}),'profile');
 assert.equal(api.launchStage({...base,complete:true}),'complete');
});
