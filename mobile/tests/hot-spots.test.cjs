const test=require('node:test'),assert=require('node:assert/strict');
const {load,compile,builder,source}=require('./product-test-runtime.cjs');
const api=require('./hot-spots-test-runtime.cjs');
const manifest=require('../src/lib/hot-spots-editorial.json');
const options={city:'nyc',neighborhood:null,userId:'me',friendIds:['f1','f2','f3','f4','f5'],demo:false,now:Date.parse('2026-10-16T03:00:00Z')};
const score=(rank,count)=>api.nightlifeScore({venue_id:'v',venue_name:'V',popularity_rank:rank,count});
const board=(catalog,statuses,opts={})=>api.buildHotSpotsBoard(catalog,statuses,options.friendIds.map(id=>({id,display_name:id,username:id,avatar_url:null})),{...options,...opts});
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('launch formula stays 70/30; 0, 1, 5, 10 and 100 users add 0, 3, 15, 30 and 30 points',()=>{
 for(const n of [0,1,20,100,1000])assert.deepEqual({...api.leaderboardWeights(n)},{curated:.7,live:.3});
 for(const [count,points] of [[0,0],[1,3],[5,15],[10,30],[100,30]]){
  approx(score(12,count).curated,10/21);approx((score(12,count).final-score(12,0).final)*100,points);
 }
 assert.equal(api.rankNightlife([{venue_id:'a',venue_name:'A',popularity_rank:1,count:0},{venue_id:'b',venue_name:'B',popularity_rank:8,count:1}])[0].venue_id,'a');
 assert.equal(api.rankNightlife([{venue_id:'a',venue_name:'A',popularity_rank:1,count:0},{venue_id:'b',venue_name:'B',popularity_rank:8,count:10}])[0].venue_id,'b');
});
test('activity elsewhere never changes a venue numerical score; deterministic ties and input are preserved',()=>{
 const a={venue_id:'a',venue_name:'Same',popularity_rank:8,count:5},b={...a,venue_id:'b',count:0};const before=score(8,5).final;
 api.rankNightlife([a,{...b,count:10}]);approx(api.nightlifeScore(a).final,before);
 assert.equal(api.rankNightlife([b,a].map(v=>({...v,count:0})))[0].venue_id,'a');assert.equal(b.count,0);
});
test('twelve verified editorial entries have distinct provider identities; ambiguous venues remain pending with no pins',()=>{
 assert.equal(manifest.venues.length,12);assert.equal(new Set(manifest.venues.map(v=>v.googlePlaceId)).size,12);
 assert.equal(manifest.venues[0].name,'Gospel');
 assert.deepEqual(manifest.pending.map(v=>v.name),['BC','Baby Grand','Casa Blanca','The Tiger','Rocco’s']);
 for(const e of manifest.venues){assert(e.lat>40&&e.lat<41);assert(e.lng>-75&&e.lng<-73);assert(e.address);assert(e.source.startsWith('https://'));}
 for(const e of manifest.pending){assert(!e.lat);assert(!e.googlePlaceId);}
});
test('explicit curation survives popularity updates and uses IDs/provider IDs, never name guessing',()=>{
 for(const e of manifest.venues){
  for(const rank of [1,500,999,null])assert.equal(api.effectiveCuratedRank(api.venue(e.venueId||'new',rank,{google_place_id:e.googlePlaceId})),e.priority);
 }
 const fake=api.venue('wrong',500,{name:'Gospel'});assert(!api.editorialForVenue(fake));assert(api.effectiveCuratedRank(fake)>12);
});
test('zero activity fills the curated board; lower-curated friend group receives one boost per person',()=>{
 const catalog=manifest.venues.map(e=>api.venue(e.venueId||e.googlePlaceId,999,{name:e.name,google_place_id:e.googlePlaceId}));
 const empty=board(catalog,[]);assert.equal(empty.venues.length,12);assert.equal(empty.venues[0].venue_name,'Gospel');assert.equal(empty.biggestMover,null);assert(empty.venues.every(v=>v.count===0&&v.energyLevel===0&&v.movement==='same'));
 const last=catalog[11],statuses=options.friendIds.map(id=>api.status(id,last.id));const result=board(catalog,statuses);
 const group=result.venues.find(v=>v.venue_id===last.id);assert.equal(group.count,5);assert.equal(group.friends.length,5);assert(group.rank<12);assert.notEqual(group.rank,1);
 const withDuplicate=board(catalog,[...statuses,statuses[0],statuses[0]]);assert.equal(withDuplicate.venues.find(v=>v.venue_id===last.id).count,5);
});
test('departures, current venue changes, expired states and private parties remove contributions; no two-hour cliff',()=>{
 const catalog=[api.venue('a'),api.venue('b',2)];
 const scenarios=[[],[api.status('f1',null)],[api.status('f1','a',{status:'home'})],[api.status('f1','a',{expires_at:'2026-10-16T03:00:00Z'})],[api.status('f1','a',{is_private_party:true})]];
 for(const statuses of scenarios)assert.equal(board(catalog,statuses).venues.reduce((n,v)=>n+v.count,0),0);
 const move=board(catalog,[api.status('f1','a'),api.status('f1','b',{updated_at:'2026-10-16T02:00:00Z'})]);assert.equal(move.venues.find(v=>v.venue_id==='a').count,0);assert.equal(move.venues.find(v=>v.venue_id==='b').count,1);
 const old=board(catalog,[api.status('f1','a',{updated_at:'2026-10-15T22:00:00Z'})]);assert.equal(old.venues[0].count,1);assert.equal(old.venues[0].recentCheckinCount,0);
 assert.equal(board(catalog,[api.status('f1','a')],{now:Date.parse('2026-10-16T09:00:00Z')}).venues[0].count,0);
});
test('permission-filtered snapshots remove revoked people; demo status never contributes in production',()=>{
 const catalog=[api.venue('a')],snapshot=[api.status('f1','a'),api.status('f2','a',{is_demo:true})];
 assert.equal(board(catalog,snapshot).venues[0].count,1);assert.equal(board(catalog,[]).venues[0].count,0);
 assert.equal(board(catalog,snapshot,{demo:true}).venues[0].count,2);
 assert.match(source('lib/supabase.ts'),/getDemoSandbox\(\) !== store/);
});
test('Members only exception is explicit; ineligible ordinary venues stay out and promotions have no rank',()=>{
 const member=manifest.venues.find(v=>v.accessLabel==='Members only');
 const result=board([api.venue('closed',1,{leaderboard_eligible:false}),api.venue(member.venueId,999,{leaderboard_eligible:false}),api.venue('promo',1,{is_leaderboard_promoted:true,leaderboard_promo_order:1}),api.venue('normal',1)],[]);
 assert(!result.venues.some(v=>v.venue_id==='closed'));assert.equal(result.venues[0].rank,0);assert.equal(result.venues.find(v=>v.venue_id===member.venueId).accessLabel,'Members only');assert(result.venues.filter(v=>!v.isPromoted).every(v=>v.rank>=1));
});
test('live read filters same venue ID/status/expiry and fails closed on errors',async()=>{
 const calls=[];let failure=null;
 const q=new Proxy({then:(yes,no)=>Promise.resolve({data:[api.status('f1','id')],error:failure}).then(yes,no)},{get:(o,k)=>k==='then'?o.then:(...args)=>{calls.push([k,...args]);return q}});
 const live=load('lib/venue-presence.ts',{'./supabase':{supabase:{from:()=>q}},'./demo-mode':{isDemoMode:()=>false}});
 await live.fetchVisibleVenuePresence('id');assert(calls.some(c=>c[0]==='eq'&&c[1]==='venue_id'&&c[2]==='id'));assert(calls.some(c=>c[0]==='eq'&&c[1]==='is_demo'&&c[2]===false));assert(!calls.some(c=>c[1]==='venue_name'));
 failure=Error('denied');await assert.rejects(live.fetchVisibleVenuePresence('id'),/denied/);
});
test('real demo client runs catalog, presence and profile queries without a network fallback',async()=>{
 const {createClient}=require('@supabase/supabase-js');
 const {DemoSandbox}=compile(source('lib/demo-sandbox.ts'),{URL,URLSearchParams,Headers,Request,Response,require:()=>({getNightKey:()=> '2026-10-15',getNightResetIso:()=> '2099-01-01T09:00:00Z'})});
 const store=new DemoSandbox({userId:'me',name:'Admin',username:'admin',city:'nyc'});let reads=0;
 const client=createClient('https://demo.invalid','demo-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(...args)=>{reads++;return store.fetch(...args)}}});
 const result=await api.hook(client,true).fetchLeaderboard('nyc',null,'me',store.tables.profiles.slice(1).map(p=>p.id));
 assert.equal(result.venues.length,3);assert.equal(result.venues.reduce((n,v)=>n+v.count,0),13);assert.equal(result.venues.reduce((n,v)=>n+v.friends.length,0),12);assert(reads>=3);
 store.tables.night_statuses.find(s=>s.user_id==='me').venue_id=null;
 const after=await api.hook(client,true).fetchLeaderboard('nyc',null,'me',[]);assert.equal(after.venues.reduce((n,v)=>n+v.count,0),12);
});
