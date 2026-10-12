const test = require('node:test');
const assert = require('node:assert/strict');
const { load, extract } = require('./product-test-runtime.cjs');
const picks = require('../src/lib/venue-picks.json');
const now = Date.parse('2026-10-12T01:00:00Z');
const apiFor = (data = picks) => load('lib/venue-recommendations.ts', { './venue-picks.json': data });
const venues = picks.map(p => ({ id: p.venueId, name: p.name, type: 'bar', neighborhood: p.neighborhood, google_photo_refs: null }));
const names = rows => Array.from(rows, r => r.name);
test('launch edit has distinct identities and independent plus official sources; Sip & Guzzle cannot be endorsed', () => {
 const api=apiFor();assert.equal(api.currentPicks('nyc',now).length,8);assert.equal(new Set(picks.map(p=>p.venueId)).size,picks.length);
 for(const p of picks){assert.ok(p.sources.some(s=>s.kind==='official'&&new URL(s.url).protocol==='https:'));assert.ok(p.sources.some(s=>s.kind==='editorial'&&new URL(s.url).protocol==='https:'));assert.ok(Date.parse(p.reviewBy)>Date.parse(p.reviewedAt))}
 const excluded={...picks[0],name:'Sip & Guzzle',venueId:'f8533b52-9128-46f6-9611-7d2c78d9fc06'};
 assert.equal(apiFor([excluded]).currentPicks('nyc',now).length,0);assert.equal(api.pickForVenue(excluded.venueId,'nyc',excluded.name,now),undefined);
});
test('future, expired, wrong-city and incomplete picks fail closed',()=>{
 const api=apiFor();assert.equal(api.currentPicks('la',now).length,0);assert.equal(api.currentPicks('nyc',Date.parse('2026-10-10')).length,0);assert.equal(api.currentPicks('nyc',Date.parse('2026-11-10')).length,0);
 for(const override of [{reviewBy:'invalid'},{sources:[picks[0].sources[0]]},{sources:[picks[0].sources[1]]}])assert.equal(apiFor([{...picks[0],...override}]).currentPicks('nyc',now).length,0);
});
test('random catalog entries, name mismatches and duplicate results cannot become recommendations',()=>{
 assert.equal(apiFor().pickForVenue(picks[0].venueId,'nyc','Renamed venue',now),undefined);
 const rows=apiFor().rankRecommendations([...venues,venues[0],{id:'random',name:'Random Bar'},{id:picks[1].venueId,name:'Wrong venue'}],'nyc',[],'',now);
 assert.equal(rows.length,7);assert.ok(!names(rows).includes('Public Records'));assert.ok(!names(rows).includes('Random Bar'));assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
});
test('editorial order ignores query ordering; only the member’s saves influence relevance',()=>{
 const api=apiFor();assert.deepEqual(names(api.rankRecommendations(venues.slice().reverse(),'nyc',[],'',now)),picks.map(p=>p.name));
 const personal=api.rankRecommendations(venues,'nyc',['Attaboy'],'',now);assert.deepEqual(names(personal).slice(0,2),['Double Chicken Please','Attaboy']);assert.equal(personal[0].relevance,'Around your saved spots');assert.equal(personal[1].relevance,null);
 assert.equal(api.rankRecommendations(venues,'nyc',[],'',now)[0].name,'Temple Bar');
});
test('search matches reviewed venue, area and style without wildcard expansion',()=>{
 const api=apiFor();assert.deepEqual(names(api.rankRecommendations(venues,'nyc',[],' HOUSE ',now)),['Gabriela']);assert.deepEqual(names(api.rankRecommendations(venues,'nyc',[],'West Village',now)),['Katana Kitten']);assert.equal(api.rankRecommendations(venues,'nyc',[],'%',now).length,0);
});
test('tonight has three distinct suggestions and both types even after personalization',()=>{
 const api=apiFor(), rows=api.rankRecommendations(venues,'nyc',['Attaboy'],'',now), strip=api.tonightRecommendations(rows);
 assert.equal(strip.length,3);assert.equal(new Set(strip.map(r=>r.id)).size,3);assert.equal(new Set(strip.map(r=>r.pick.category)).size,2);assert.equal(api.tonightRecommendations([]).length,0);assert.equal(api.tonightRecommendations(rows.slice(0,1)).length,1);
});
test('fetch reads only reviewed public ids; absent picks avoid queries and failures remain failures',async()=>{
 const calls=[];let error=null;
 const q=new Proxy({then:(yes,no)=>Promise.resolve({data:venues,error}).then(yes,no)},{get:(o,k)=>k==='then'?o.then:(...args)=>{calls.push([k,...args]);return q}});
 const api=load('lib/venue-discovery.ts',{'./venue-recommendations':{currentPicks:city=>city==='nyc'?picks:[]},'./supabase':{supabase:{from:t=>{calls.push(['from',t]);return q}}}});
 assert.equal((await api.fetchFeaturedVenues('la')).length,0);assert.equal(calls.length,0);await api.fetchFeaturedVenues('nyc');
 assert.deepEqual(calls.filter(x=>x[0]==='from'),[['from','venues']]);assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','city','nyc'],['eq','is_demo',false]]);assert.deepEqual(Array.from(calls.find(x=>x[0]==='in')[2]),picks.map(p=>p.venueId));
 error=Error('offline');await assert.rejects(api.fetchFeaturedVenues('nyc'),/offline/);
});
test('empty Home leads with friends, then recommendations, with one compact Post action for members with friends',()=>{
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const fn=extract('app/(tabs)/(home)/index.tsx','EmptyFeed',{require:()=>jsx,View:'View',Text:'Text',Pressable:'Pressable',SymbolView:'SymbolView',EmptyState:'EmptyState',OutTonightCard:'OutTonightCard',PlanningTonightCard:'PlanningTonightCard',ForTonight:'ForTonight',NEON:'lime',addFriendsActions:()=>[{label:'Find friends'}],router:{push:()=>{}}});
 for(const friendCount of [0,3]){const nodes=[];const visit=n=>{if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){nodes.push(n);visit(n.props?.children)}};visit(fn({friendCount,outFriends:friendCount ? [{user_id:"friend"}] : [],planningFriends:[],venuesWithheld:true,onMeetUp:()=>{}}));
 const types=nodes.map(n=>n.type);assert.equal(types.filter(t=>t==='ForTonight').length,1);
 if(!friendCount){assert.ok(types.indexOf('EmptyState')<types.indexOf('ForTonight'));assert.equal(types.includes('OutTonightCard'),false)}
 else{assert.ok(types.indexOf('OutTonightCard')<types.indexOf('ForTonight'));assert.equal(nodes.find(n=>n.type==='OutTonightCard').props.venuesWithheld,true);assert.ok(types.indexOf('Pressable')>types.indexOf('ForTonight'))}
 }
});
