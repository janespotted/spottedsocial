const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./product-test-runtime.cjs');
const t=load('lib/tonight.ts');
// Wall clock in a zone → the instant (minutes precision is enough here).
const at=(iso,tz)=>{const naive=new Date(iso+'Z');for(let d=new Date(naive),i=0;i<3;i++){const p=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).reduce((o,x)=>(o[x.type]=x.value,o),{});const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute);d=new Date(d.getTime()+(naive.getTime()-wall));if(i===2)return d;}};
const NY='America/New_York',LA='America/Los_Angeles',LHR='Asia/Karachi';

test('NM-01 opening hour per weekday in New York (week of Oct 5 2026)',()=>{
 const expect={'2026-10-05':18,'2026-10-06':18,'2026-10-07':18,'2026-10-08':18,'2026-10-09':16,'2026-10-10':12,'2026-10-11':15};
 for(const [day,hour] of Object.entries(expect)){
  const opens=t.nightModeOpensAt(at(day+'T09:00',NY),'nyc');
  assert.equal(opens.getTime(),at(`${day}T${String(hour).padStart(2,'0')}:00`,NY).getTime(),day);
 }
});

test('NM-02 open/closed around the opening and the 5 AM reset',()=>{
 assert.equal(t.isNightModeOpen(at('2026-10-05T17:59',NY),'nyc'),false);
 assert.equal(t.isNightModeOpen(at('2026-10-05T18:00',NY),'nyc'),true);
 assert.equal(t.isNightModeOpen(at('2026-10-06T04:59',NY),'nyc'),true,'Monday night still open at 4:59');
 assert.equal(t.isNightModeOpen(at('2026-10-06T05:00',NY),'nyc'),false,'Tuesday day starts at 5');
});

test('NM-03 1 AM Saturday belongs to Friday night; Saturday opens at noon',()=>{
 assert.equal(t.isNightModeOpen(at('2026-10-10T01:00',NY),'nyc'),true);
 assert.equal(t.isNightModeOpen(at('2026-10-10T11:59',NY),'nyc'),false);
 assert.equal(t.isNightModeOpen(at('2026-10-10T12:00',NY),'nyc'),true);
 assert.equal(t.isNightModeOpen(at('2026-10-11T14:59',NY),'nyc'),false,'Sunday before 3 PM');
});

test('NM-04 next change: the opening in the day, the reset at night',()=>{
 assert.equal(t.nextModeChangeAt(at('2026-10-05T11:42',NY),'nyc').getTime(),at('2026-10-05T18:00',NY).getTime());
 assert.equal(t.nextModeChangeAt(at('2026-10-05T21:00',NY),'nyc').getTime(),at('2026-10-06T05:00',NY).getTime());
});

test('NM-05 daylight saving: the opening stays at local wall-clock time',()=>{
 // US DST ends Sun Nov 1 2026, starts Sun Mar 8 2026.
 assert.equal(t.nightModeOpensAt(at('2026-11-01T09:00',NY),'nyc').getTime(),at('2026-11-01T15:00',NY).getTime());
 assert.equal(t.nightModeOpensAt(at('2026-11-02T09:00',NY),'nyc').getTime(),at('2026-11-02T18:00',NY).getTime());
 assert.equal(t.nightModeOpensAt(at('2026-03-08T09:00',LA),'la').getTime(),at('2026-03-08T15:00',LA).getTime());
 assert.equal(new Date(at('2026-11-02T18:00',NY)).toISOString(),'2026-11-02T23:00:00.000Z');
});

test('NM-06 Los Angeles and Lahore use their own zones',()=>{
 assert.equal(t.nightModeOpensAt(at('2026-10-05T09:00',LA),'la').toISOString(),'2026-10-06T01:00:00.000Z');
 assert.equal(t.nightModeOpensAt(at('2026-10-05T09:00',LHR),'lhr').toISOString(),'2026-10-05T13:00:00.000Z');
 assert.equal(t.isNightModeOpen(new Date('2026-10-05T13:00:00Z'),'lhr'),true);
 assert.equal(t.isNightModeOpen(new Date('2026-10-05T13:00:00Z'),'nyc'),false);
});

test('NM-07 opening time label',()=>{
 assert.equal(t.formatOpeningTime(at('2026-10-05T18:00',NY),'nyc'),'6 PM');
 assert.equal(t.formatOpeningTime(at('2026-10-10T12:00',NY),'nyc'),'12 PM');
});
