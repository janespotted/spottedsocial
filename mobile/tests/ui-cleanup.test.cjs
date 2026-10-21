const test = require('node:test');
const assert = require('node:assert/strict');
const { load, queryFunction, builder, extract } = require('./product-test-runtime.cjs');
function catalog(response) {
 const calls=[];
 const q=new Proxy({then:(yes,no)=>Promise.resolve(response).then(yes,no)}, {get:(o,k)=>k==='then'?o.then:(...args)=>{calls.push([k,...args]);return q}});
 const api=load('lib/venue-discovery.ts',{'./venue-recommendations':{currentPicks:()=>[]},'./supabase':{supabase:{from:t=>{calls.push(['from',t]);return q}}}});
 return {api,calls};
}
test('daytime discovery reads only real catalog venues in the selected city, with stable paging and literal search',async()=>{
 const {api,calls}=catalog({data:[{id:'venue'}],error:null});
 assert.equal((await api.fetchDiscoveryVenues('la','100%_\\',1))[0].id,'venue');
 assert.deepEqual(calls.filter(x=>x[0]==='from'),[['from','venues']]);
 assert.deepEqual(calls.find(x=>x[0]==='select'),['select','id,name,neighborhood,type,google_photo_refs']);
 assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','city','la'],['eq','is_demo',false]]);
 assert.deepEqual(calls.filter(x=>x[0]==='order'),[['order','name'],['order','id']]);
 assert.deepEqual(calls.find(x=>x[0]==='range'),['range',24,47]);
 assert.deepEqual(calls.find(x=>x[0]==='ilike'),['ilike','name','%100\\%\\_\\\\%']);
});
test('Saved is account-scoped, deduplicates names and does not query an empty saved list',async()=>{
 const {api,calls}=catalog({data:[{venue_name:'Zulu'},{venue_name:'Ava'},{venue_name:'Ava'}],error:null});
 assert.deepEqual(Array.from(await api.fetchSavedVenueNames('owner')),['Ava','Zulu']);
 assert.deepEqual(calls.find(x=>x[0]==='eq'),['eq','user_id','owner']);
 calls.length=0;assert.equal((await api.fetchDiscoveryVenues('nyc','',0,[])).length,0);assert.equal(calls.length,0);
 await api.fetchDiscoveryVenues('nyc','',0,['Ava']);assert.equal(calls.find(x=>x[0]==='in')[2][0],'Ava');
});
test('catalog and saved-list failures remain failures, never fabricated empty results',async()=>{
 const {api}=catalog({data:null,error:Error('offline')});
 await assert.rejects(api.fetchDiscoveryVenues('nyc','',0),/offline/);
 await assert.rejects(api.fetchSavedVenueNames('owner'),/offline/);
});
test('daytime venue detail excludes live status, friend profiles and plan participant reads',async()=>{
 const tables=[];
 const fn=queryFunction('app/venue.tsx','venue-card',{isNight:false,session:{user:{id:'owner'}},venueId:'venue',friendIds:undefined,
  fetchProfilesSafe:async()=>{throw Error('Live profile read in daytime')},buildProfileMap:()=>new Map(),uniquePeople:x=>x,toFriend:x=>x,
  supabase:{from:t=>{tables.push(t);return builder({data:t==='venues'?{id:'venue',name:'Bar'}:null,error:null})}}});
 const result=await fn();
 assert.equal(result.friendsAtVenue.length,0);assert.equal(result.friendsPlanning.length,0);
 assert.deepEqual([...new Set(tables)].sort(),['venues','wishlist_places']);
});
test('venue save state read failure is retryable rather than displaying a false unsaved state',async()=>{
 const fn=queryFunction('app/venue.tsx','venue-card',{isNight:false,session:{user:{id:'owner'}},venueId:'venue',
 supabase:{from:t=>builder(t==='venues'?{data:{id:'venue',name:'Bar'},error:null}:{data:null,error:Error('saved list offline')})}});
 await assert.rejects(fn(),/saved list offline/);
});
test('nominee labels stay on the device, remain isolated between accounts, and cannot follow a replaced number',async()=>{
 const storage=new Map();let rpcs=0;
 const api=load('lib/nomination-progress.ts',{'@react-native-async-storage/async-storage':{__esModule:true,default:{setItem:async(k,v)=>storage.set(k,v),getItem:async k=>storage.get(k)}},'./launch':{launchRpc:async()=>{rpcs++;return{nominations:[]}}}});
 await api.saveNomineeLabel('a',1,'+12025550101',' Ava ');
 assert.equal(rpcs,0);
 const a=await api.readNomineeLabels('a');assert.equal(api.nomineeName(a,1,'+12025550101'),'Ava');
 assert.equal(api.nomineeName(a,1,'+12025550102'),'');
 assert.equal(Object.keys(await api.readNomineeLabels('b')).length,0);
 storage.set('spotted:nominee-label:a:2','bad json');assert.equal(Object.keys(await api.readNomineeLabels('a')).length,1);
});
test('nighttime cards always display curated rank without inventing live activity',()=>{
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 for(const count of [0,2]){
 const fn=extract('app/(tabs)/(leaderboard)/leaderboard.tsx','VenueCard',{require:()=>jsx,View:'View',Text:'Text',Pressable:'Pressable',SymbolView:'SymbolView',FriendStack:'FriendStack',NEON:'lime',openVenue:()=>{}});
 const tree=fn({venue:{rank:1,count,venue_name:'Test Venue',friends:[],movement:'same'}});
 assert.equal(tree.props.accessibilityLabel.includes('Number 1'),true);
 assert.equal(!!tree.props.style,true);
 }
});
test('Home plans preview distinguishes a failed read from a successful empty list',()=>{
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 for(const mode of ['loading','error','empty','content']){
 const plans=mode==='content'?[{id:'plan',plan_time:'21:00',plan_date:'2026-10-12'}]:[];
 const fn=extract('components/home-plans-preview.tsx','HomePlansPreview',{require:()=>jsx,
 usePlansRealtime:()=>{},useNightMode:()=>({city:'nyc'}),usePlans:()=>({data:mode==='error'||mode==='loading'?undefined:{plans},isError:mode==='error',isPending:mode==='loading'}),previewPlans:()=>({plans,tonight:true}),getNightKey:()=> '2026-10-12',formatTimeTo12Hour:()=> '9 PM',friendCardPress:()=>()=>{},Avatar:'Avatar',View:'View',Text:'Text',Pressable:'Pressable',SymbolView:'SymbolView',ErrorState:'ErrorState',NEON:'lime',MIST:'white',router:{push:()=>{}}});
 const tree=fn(); const types=[];const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){types.push(n.type);visit(n.props?.children)}};visit(tree);
 assert.equal(types.includes('ErrorState'),mode==='error');
 if(mode==='loading')assert.equal(tree.props.accessibilityLabel,'Loading plans');
 if(mode==='empty')assert.equal(tree.props.accessibilityLabel,'Make a plan');
 if(mode==='content')assert(types.includes('Avatar'));
 }
});
