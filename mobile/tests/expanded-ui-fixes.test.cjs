const test=require('node:test'),assert=require('node:assert/strict');
const {load,extract,source}=require('./product-test-runtime.cjs');

test('Map cards fit the actual map frame across edges, banner/safe area, compact width and large text',()=>{
 const {mapPopupLayout}=load('lib/popup-bounds.ts');
 for(const width of [375,402,440])for(const height of [560,700,840])for(const topInset of [0,62])for(const scale of [1,1.353]){
  for(const [x,y] of [[40,topInset+60],[width-40,topInset+60],[40,height-150],[width-40,height-150],[width/2,height/2]]){
   const p=mapPopupLayout({x,y,width,height,topInset,bottomInset:98,desiredHeight:450*scale});
   assert(p.left>=12);assert(p.left+p.width<=width-12);assert(p.top>=topInset+12);assert(p.top+p.height<=height-110+0.001);assert(p.height>70);
   assert(p.pointerLeft>=p.left);assert(p.pointerLeft+14<=p.left+p.width);
   assert(p.pointerTop===p.top-7||p.pointerTop===p.top+p.height-7);
  }
 }
});

test('Demo photos resolve locally, clear at reset, and never call Storage/auth/Edge services',async()=>{
 const {DemoSandbox}=load('lib/demo-sandbox.ts',{'./tonight':{getNightKey:()=> '2026-10-16',getNightResetIso:()=> '2026-10-17T09:00:00Z'}});
 const demo=new DemoSandbox({userId:'owner',name:'Synthetic',username:'synthetic',city:'nyc'});
 const mode={getDemoSandbox:()=>demo,isDemoMode:()=>true};
 const publish=load('lib/publish-post.ts',{'./demo-mode':mode,'./session-identity':{},'expo-file-system':{File:class {constructor(){throw Error('Unexpected native upload')}}},'expo-device':{isDevice:true},'react-native':{Platform:{OS:'ios'}},'./media-prep':{},'./posts':{},'./supabase':{},'./tonight':{}});
 const media=load('lib/private-media.ts',{'./demo-mode':mode,'./session-identity':{onSessionIdentityChange(){}},'./supabase':{}});
 const path='owner/private-v1/photo.jpg';let progress=0;
 await publish.uploadMedia(path,{uri:'file:///test.jpg'},p=>progress=p);assert.equal(progress,1);
 assert.equal((await media.resolvePrivateMedia({paths:[path,'unknown']})).paths.get(path),'file:///test.jpg');
 assert.throws(()=>demo.saveMedia('other/private-v1/photo.jpg','file:///test.jpg'));
 demo.reset();assert.equal((await media.resolvePrivateMedia({paths:[path]})).paths.size,0);
});

test('DM photo retry prepares JPEG, uploads once, reuses a successful path and rejects account change',async()=>{
 let revision=1,uploads=0,preps=0,fail=true,owner='owner';
 const media={uri:'file:///resized.jpg',type:'image',mimeType:'image/jpeg',fileExt:'jpg'};
 const {uploadPendingDmPhoto}=load('lib/dm-photo.ts',{
  './media-prep':{prepareForUpload:async()=>{preps++;return media}},
  './publish-post':{uploadMedia:async(path,value)=>{uploads++;assert.equal(value,media);if(fail)throw Error('offline')}},
  './session-identity':{getSessionRevision:()=>revision,getSessionUserId:()=>owner,assertSessionRevision:r=>{if(r!==revision)throw Error('Account changed')}}
 });
 const draft={id:'stable',sender_id:'owner',thread_id:'thread',image_url:null,localAsset:'file:///original.heic',localMimeType:'image/heic'};
 await assert.rejects(uploadPendingDmPhoto(draft),/offline/);assert.equal(draft.localAsset,'file:///original.heic');assert.equal(draft.image_url,null);
 fail=false;const ready=await uploadPendingDmPhoto(draft);assert(ready.image_url.startsWith('owner/private-v1/dm/thread/stable-'));assert(ready.image_url.endsWith('.jpg'));
 assert.equal(await uploadPendingDmPhoto(ready),ready);assert.equal(uploads,2);assert.equal(preps,2);
 owner='other';await assert.rejects(uploadPendingDmPhoto(draft),/Account changed/);
});

test('TBD venue/area saves only the chosen intent and retains the audience',async()=>{
 for(const areaOpen of [false,true]){
  let saved;const fn=extract('app/check-in.tsx','sharePlanning',{userId:'owner',submitting:false,setSubmitting(){},setError(){},city:'nyc',areaOpen,neighborhood:'SoHo',planningSpot:{id:'venue',name:'BC'},audience:'close_friends',goPlanning:async(_,v)=>saved=v,Haptics:{notificationAsync(){},NotificationFeedbackType:{Success:1}},refreshStatusQueries(){},showPayoff:async()=>{}});
  await fn();assert.equal(saved.visibility,'close_friends');assert.equal(saved.neighborhood,areaOpen?'SoHo':null);assert.equal(saved.venueId,areaOpen?null:'venue');assert.equal(saved.venueName,areaOpen?null:'BC');
 }
});

test('Plan audience survives edit without broadening and includes all three explicit rings',()=>{
 const {PLAN_AUDIENCES,planAudience}=load('lib/plan-audience.ts');assert.deepEqual(Array.from(PLAN_AUDIENCES,x=>x.key),['close_friends','friends','mutual_friends']);
 for(const ring of PLAN_AUDIENCES)assert.equal(planAudience(ring.key),ring.key);
});
