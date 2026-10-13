const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, source } = require('./product-test-runtime.cjs');
const { popupBounds } = load('lib/popup-bounds.ts');
test('floating rosters stay within narrow, wide, and landscape screens', () => {
  for (const width of [240,320,375,430,844]) for (const x of [-30,0,16,width-30,width+50]) {
    const b=popupBounds({x,y:500,width,height:700,topInset:59,bottomInset:34});
    assert(b.left >= 12); assert(b.left+b.width <= width-12); assert(b.maxHeight <= 421);
  }
});
test('rosters have only the available height above their trigger', () => {
  for (const y of [0,60,100,160,600]) {
    const b=popupBounds({x:280,y,width:320,height:700,topInset:59});
    assert(b.maxHeight >= 0); assert(b.maxHeight <= Math.max(0,y-79));
  }
});
test('recap excludes library additions even when an older server returns them', async () => {
  const api=load('lib/night-recap.ts',{'./supabase':{supabase:{rpc:async()=>({data:{id:'r',night_date:'2026-10-13',photos:[{id:'posted',source:'post',storage_key:'p'},{id:'private-library',source:'library',storage_key:'l'},{id:'unknown',storage_key:'u'}]},error:null})}},'./private-media':{}});
  assert.deepEqual((await api.fetchNightRecap()).photos.map(p=>p.id),['posted']);
});
test('all recap surfaces use post-only pictures and never scan the personal library', () => {
  const s=source('hooks/use-night-recap.ts');
  assert.doesNotMatch(s,/findNightPhotos|useCameraRollAccess|requestCameraRollAccess/);
  assert.match(s,/p.source === 'post'/);
  assert.doesNotMatch(source('app/(recap)/morning-after.tsx'),/Add from your library|requestAccess/);
});
