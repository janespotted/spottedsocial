const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = path.join(__dirname, '../src/lib/location-quality.ts');
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
new Function('exports', 'module', compiled)(moduleUnderTest.exports, moduleUnderTest);
const { validFix, normalizeVenueMatch, canGroupSpots, locationLabel, distanceBetween } = moduleUnderTest.exports;
const now = Date.parse('2026-09-22T23:30:00Z');
const fix = { lat: 40.72, lng: -73.99, accuracy: 20, recordedAt: new Date(now).toISOString(), speed: 0 };
const spot = { lat: 40.72, lng: -73.99, venue_id: 'bar-a', is_private_party: false, last_location_at: fix.recordedAt };
test('fresh accurate fixes only; rejects stale, future, missing and poor readings', () => {
  assert.equal(validFix(fix, now), true);
  for (const patch of [{ accuracy: 100 }, { accuracy: -1 }, { accuracy: NaN }, {lat: NaN}, {lng: 181},
    { recordedAt: 'bad' }, { recordedAt: new Date(now-121000).toISOString() }, { recordedAt: new Date(now+16000).toISOString() }])
    assert.equal(validFix({...fix,...patch},now),false,JSON.stringify(patch));
});
test('both deployed and legacy venue result shapes normalize without undefined IDs', () => {
  assert.deepEqual(normalizeVenueMatch({id:'a',name:'Bar',distance:20}), {id:'a',name:'Bar',distance:20});
  assert.deepEqual(normalizeVenueMatch({venue_id:'a',venue_name:'Bar',distance_meters:20}), {id:'a',name:'Bar',distance:20});
  assert.equal(normalizeVenueMatch({name:'Bar',distance:10}),null);
  assert.equal(normalizeVenueMatch({id:'a',name:'Bar',distance:NaN}),null);
});
test('same venue never groups friends who separated; distinct IDs do not merge on name', () => {
  assert.equal(canGroupSpots(spot,{...spot,lat:40.74},now),false);
  assert.equal(canGroupSpots(spot,{...spot,lat:40.7202},now),true);
  assert.equal(canGroupSpots(spot,{...spot,venue_id:'bar-b',lat:40.7202},now),false);
});
test('old locations remain last-known and cannot form a live group', () => {
  const stale = new Date(now-2*60*60*1000).toISOString();
  assert.equal(canGroupSpots({...spot,last_location_at:stale},spot,now),false);
  assert.equal(locationLabel(stale,now),'Updated 2h 0m ago');
  assert.equal(locationLabel(null,now),'Location unavailable');
  assert.equal(locationLabel(fix.recordedAt,now+61000),'Updated 1 min ago');
});
test('distance is finite for coincident and antipodal coordinates', () => {
  assert.equal(distanceBetween(spot,spot),0);
  assert.ok(Number.isFinite(distanceBetween({lat:90,lng:0},{lat:-90,lng:180})));
});
