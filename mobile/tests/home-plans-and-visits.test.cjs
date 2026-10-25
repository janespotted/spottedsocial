const test = require('node:test');
const assert = require('node:assert/strict');
const { extract, load } = require('./product-test-runtime.cjs');
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
const planApi=load('lib/plans.ts',{'./supabase':{},'./profiles':{},'./demo-mode':{},'./tonight':{}});
const preview=extract('components/home-plans-preview.tsx','previewPlans',{splitTonightUpcoming:planApi.splitTonightUpcoming});
const plans=[{id:'old',plan_date:'2026-10-10'},{id:'later',plan_date:'2026-10-20'},{id:'tonight1',plan_date:'2026-10-11'},{id:'near',plan_date:'2026-10-12'},{id:'tonight2',plan_date:'2026-10-11'},{id:'tonight3',plan_date:'2026-10-11'}];
const ids=r=>Array.from(r.plans,p=>p.id);
test('preview keeps tonight score order, caps two, drops past, and falls back to nearest future plans',()=>{
 assert.deepEqual(ids(preview(plans,'2026-10-11')),['tonight1','tonight2']);
 assert.deepEqual(ids(preview(plans,'2026-10-12')),['near']);
 assert.deepEqual(ids(preview(plans.filter(p=>!p.id.startsWith('tonight')),'2026-10-11')),['near','later']);
 assert.equal(preview(plans,'2026-10-21').plans.length,0);
 assert.deepEqual(plans.map(p=>p.id),['old','later','tonight1','near','tonight2','tonight3']);
});
function treeNodes(n,out=[]){if(Array.isArray(n))n.forEach(c=>treeNodes(c,out));else if(n&&typeof n==='object'){out.push(n);treeNodes(n.props?.children,out)}return out}
test('populated preview and no-plan shortcut both navigate to Plans, while loading and errors stay distinct',()=>{
 let query,pushed=[],retries=0;
 const fn=extract('components/home-plans-preview.tsx','HomePlansPreview',{require:()=>jsx,View:'View',Text:'Text',Pressable:'Pressable',SymbolView:'SymbolView',Avatar:'Avatar',friendCardPress:()=>()=>{},ErrorState:'ErrorState',usePlans:()=>query,usePlansRealtime:()=>{},useNightMode:()=>({city:'nyc'}),previewPlans:preview,getNightKey:()=> '2026-10-11',formatTimeTo12Hour:planApi.formatTimeTo12Hour,router:{push:p=>pushed.push(p)},NEON:'lime',MIST:'gray'});
 const p={id:'real',plan_date:'2026-10-11',venue_name:'Gospel',plan_time:'22:30',user:{display_name:'Alex',avatar_url:null}};
 query={data:{plans:[p]}};
 let nodes=treeNodes(fn());let controls=nodes.filter(n=>n.type==='Pressable');assert.equal(controls.length,2);controls.forEach(c=>c.props.onPress());assert.deepEqual(pushed,['/messages?tab=plans','/messages?tab=plans']);assert.match(controls[1].props.accessibilityLabel,/Gospel. Alex · 10:30PM/);
 query={data:{plans:[]}};nodes=treeNodes(fn());nodes.find(n=>n.type==='Pressable').props.onPress();assert.equal(pushed.at(-1),'/messages?tab=plans');
 query={isPending:true};assert.equal(treeNodes(fn()).some(n=>n.type==='Pressable'),false);
 query={isError:true,refetch:()=>{retries++}};const error=treeNodes(fn()).find(n=>n.type==='ErrorState');assert.ok(error);error.props.onRetry();assert.equal(retries,1);
});
