const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./product-test-runtime.cjs');
const plans=load('lib/plans.ts',{'./supabase':{supabase:{}},'./profiles':{},'./demo-mode':{isDemoMode:()=>false},'./tonight':{getNightKey:()=>'2026-10-05',nightResetAfterDate:()=>new Date(),nightStartAt:()=>new Date()}});
const recap=load('lib/night-recap.ts',{'./supabase':{supabase:{}},'./private-media':{resolvePrivateMedia:async()=>({paths:new Map()})}});

test('DM-01 plans split into tonight and upcoming by night key, keeping order',()=>{
 const items=[{id:'a',d:'2026-10-05'},{id:'b',d:'2026-10-09'},{id:'c',d:'2026-10-04'},{id:'d',d:'2026-10-05'},{id:'e',d:'2026-10-06'}];
 const {tonight,upcoming}=plans.splitTonightUpcoming(items,x=>x.d,'2026-10-05');
 assert.equal(tonight.map(x=>x.id).join(),'a,d');
 assert.equal(upcoming.map(x=>x.id).join(),'b,e','yesterday is dropped');
});

test('DM-02 recap chapters come from what exists; no blank chapters',()=>{
 const s=[{}],p=[{}],f=[{}];
 assert.equal(recap.recapChapters({stops:s,photos:p,people:f}).join(),'stops,pictures,people');
 assert.equal(recap.recapChapters({stops:s,photos:[],people:[]}).join(),'stops,pictures','pictures stays with stops so photos can be added');
 assert.equal(recap.recapChapters({stops:[],photos:p,people:[]}).join(),'pictures');
 assert.equal(recap.recapChapters({stops:[],photos:[],people:[]}).join(),'');
});

test('DM-03 recap date label reads the night date, not the device zone',()=>{
 assert.equal(recap.recapDateLabel('2026-09-21'),'SEP 21');
});
