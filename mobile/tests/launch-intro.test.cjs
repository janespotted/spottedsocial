const test = require('node:test');
const assert = require('node:assert/strict');
const { load, extract } = require('./product-test-runtime.cjs');

test('Rapid taps cannot skip a page, and reduced motion changes pages without animation', () => {
  for (const reduce of [false, true]) {
    const callbacks=[],saved=[],steps=[];
    const locked={current:false};
    const move=extract('components/launch-introduction.tsx','move',{
      locked,reduce,INTRO_STEPS:[1,2,3],motion:{},setBusy:()=>{},setStep:x=>steps.push(x),
      onStep:x=>saved.push(x),scroll:{current:{scrollTo:()=>{}}},
      Haptics:{selectionAsync:async()=>{}},
      Animated:{timing:()=>({start:fn=>callbacks.push(fn)})},
    });
    move(1);
    if (!reduce) {
      move(2); assert.equal(callbacks.length,1); assert.equal(saved.length,0);
      callbacks.shift()({finished:true});
      assert.equal(saved[0],1); assert.equal(steps[0],1);
      callbacks.shift()({finished:true});
    } else { assert.equal(callbacks.length,0); assert.equal(saved[0],1); }
    assert.equal(locked.current,false);
    move(3);
    if (!reduce) callbacks.shift()({finished:true});
    assert.equal(saved.at(-1),3);
    assert.equal(steps.at(-1),1,'completion returns to setup rather than indexing a fourth page');
  }
});

test('Introduction opens only after sign-in, before profile setup, without restarting completed accounts', () => {
  let account;
  const element = (type, props) => ({ type, props });
  const render = extract('app/onboarding/index.tsx', 'LaunchOnboarding', {
    useSession: () => account, LaunchIntroduction: 'intro', LaunchSetup: 'setup',
    require: () => ({ jsx: element, jsxs: element }),
  });
  for (const session of [null, { user: { id: 'alice' } }]) {
    for (const launch of [null, { complete: false, profileSaved: false }, { complete: false, profileSaved: true }, { complete: true, profileSaved: true }]) {
      account = { session, launch };
      const tree = render();
      assert.equal(tree.props.enabled, !!session && !!launch && !launch.complete && !launch.profileSaved);
      assert.equal(tree.props.children.type, 'setup');
    }
  }
});

test('Introduction resumes the correct page after restart and keeps accounts separate', async () => {
  const saved = new Map();
  const storage = { getItem: async k => saved.get(k) ?? null, setItem: async (k,v) => saved.set(k,v) };
  let api = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': storage });
  assert.equal(await api.readIntroStep('alice'), 0);
  await api.saveIntroStep('alice', 1);
  api = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': storage });
  assert.equal(await api.readIntroStep('alice'), 1);
  assert.equal(await api.readIntroStep('bob'), 0);
  await api.saveIntroStep('alice', 3);
  api = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': storage });
  assert.equal(await api.readIntroStep('alice'), 3);
  // Explanation completion cannot complete the server's mandatory setup.
  const launch = load('lib/launch.ts', { '@/lib/supabase': { supabase: {} } });
  assert.equal(launch.launchStage({ admitted: true, profileSaved: false, complete: false }), 'profile');
  assert.equal(launch.launchStage({ admitted: true, profileSaved: true, complete: false, nominations: [] }), 'nominate');
});

test('Bad or unavailable local storage cannot break setup or overwrite newer intro progress', async () => {
  for (const value of ['bad', '-1', '1.5', '10']) {
    const api = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': { getItem: async () => value } });
    assert.equal(await api.readIntroStep('alice'), 0);
  }
  const failing = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': { getItem: async () => { throw Error('read'); }, setItem: async () => { throw Error('write'); } } });
  assert.equal(await failing.readIntroStep('alice'), 0);
  await assert.doesNotReject(failing.saveIntroStep('alice', 3));
  assert.equal(await failing.readIntroStep('alice'), 3);
  let finish;
  const racing = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': { getItem: () => new Promise(r => { finish = r; }), setItem: async () => {} } });
  const stale = racing.readIntroStep('alice');
  await racing.saveIntroStep('alice', 2);
  finish('0');
  assert.equal(await stale, 2);
});
