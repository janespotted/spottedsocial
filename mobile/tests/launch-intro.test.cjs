const test = require('node:test');
const assert = require('node:assert/strict');
const { load, extract, flush } = require('./product-test-runtime.cjs');

function navigationHarness(reduce = false) {
  const callbacks=[],saved=[],steps=[],positions=[];
  const locked={current:false},completion={current:null},currentStep={current:0};
  const move=extract('components/launch-introduction.tsx','move',{
    locked,completion,currentStep,reduce,INTRO_STEPS:[1,2,3,4],
    motion:{setValue:x=>positions.push(x),stopAnimation:()=>{}},PAGE_EASE:()=>{},
    setBusy:()=>{},setTarget:()=>{},setStep:x=>steps.push(x),onStep:x=>saved.push(x),scrolls:{current:[]},
    Haptics:{selectionAsync:async()=>{}},Animated:{timing:()=>({start:fn=>callbacks.push(fn)})},
  });
  return {move,callbacks,saved,steps,positions,locked,completion,currentStep};
}

test('Rapid taps cannot skip a page, and reduced motion changes pages without animation', () => {
  for (const reduce of [false, true]) {
    const h=navigationHarness(reduce);
    h.move(1);
    if (!reduce) {
      h.move(2); assert.equal(h.callbacks.length,1); assert.deepEqual(h.saved,[]);
      h.callbacks.shift()({finished:true});
    } else assert.equal(h.callbacks.length,0);
    assert.deepEqual(h.saved,[1]); assert.deepEqual(h.steps,[1]);
    assert.equal(h.locked.current,false);
    h.currentStep.current=3;h.move(4);
    assert.equal(h.saved.at(-1),4);
    assert.equal(h.steps.at(-1),1,'completion returns to setup rather than indexing past the final page');
  }
});

test('An interrupted page transition stays on the current page and can be retried', () => {
  const h=navigationHarness();
  h.move(1); h.callbacks.shift()({finished:false});
  assert.equal(h.locked.current,false);assert.deepEqual(h.saved,[]);assert.deepEqual(h.steps,[]);
  assert.equal(h.positions.at(-1),0);
  h.move(1);h.callbacks.shift()({finished:true});
  assert.deepEqual(h.saved,[1]);assert.deepEqual(h.steps,[1]);assert.equal(h.locked.current,false);
});

test('Settling a transition for Reduce Motion or background ignores its late callback', () => {
  const h=navigationHarness();h.move(1);
  const stale=h.callbacks.shift();h.completion.current();
  assert.deepEqual(h.saved,[1]);assert.equal(h.locked.current,false);
  h.move(2);stale({finished:false});
  assert.equal(h.locked.current,true,'an old cancellation cannot unlock the next transition');
  h.callbacks.shift()({finished:true});
  assert.deepEqual(h.saved,[1,2]);assert.equal(h.locked.current,false);
});

test('Changing Reduce Motion takes precedence over an older preference read and carries into new screens', async () => {
  let resolveRead, change;
  const updates=[],cleanups=[];
  const hook=extract('components/launch-motion.tsx','useLaunchReducedMotion',{
    currentReduceMotion:undefined,useReducedMotion:()=>false,
    useState:initial=>[initial(),value=>updates.push(value)],
    useEffect:effect=>cleanups.push(effect()),
    AccessibilityInfo:{
      isReduceMotionEnabled:()=>new Promise(resolve=>{resolveRead=resolve;}),
      addEventListener:(_,listener)=>{change=listener;return {remove:()=>{}};},
    },
  });
  assert.equal(hook(),false);
  change(true);
  resolveRead(false);
  await flush();
  assert.deepEqual(updates,[true],'a stale startup read must not restart motion');
  assert.equal(hook(),true,'the next illustration starts with the live preference');
  cleanups.forEach(cleanup=>cleanup());
});

function setupHarness(launch, save = async () => ({ ...launch, profileSaved: true })) {
  let cursor = 0;
  const hooks = [];
  const element = (type, props) => ({ type, props });
  const hook = initial => {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks[i], value => { hooks[i] = typeof value === 'function' ? value(hooks[i]) : value; }];
  };
  const { launchStage } = load('lib/launch.ts', { '@/lib/supabase': { supabase: {} } });
  const render = extract('app/onboarding/index.tsx', 'LaunchSetup', {
    useSession: () => ({ session: { user: { id: 'alice', user_metadata: {} } }, launch, refreshOnboardingStatus: async () => {} }),
    useState: hook, useRef: value => hook({ current: value })[0], useEffect: () => {}, launchStage,
    LaunchIntroduction: 'intro', LaunchShell: 'shell', LaunchButton: 'button', Text: 'text', View: 'view',
    TextInput: 'input', Pressable: 'pressable', SymbolView: 'symbol', MIST: '', NEON: '', INK: '',
    launchRpc: save, Haptics: { selectionAsync: () => {} }, Keyboard: { dismiss: () => {} },
    formatE164: value => value,
    require: () => ({ jsx: element, jsxs: element }),
  });
  return () => { cursor = 0; return render(); };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat().flatMap(nodes)];
}

test('Profile comes first; the introduction waits for saved profile and never replaces the invitation gate', () => {
  const base = { admitted: true, profileSaved: false, complete: false, hasPhone: true, nominations: [] };
  assert.equal(setupHarness(base)().props.title, 'Make an entrance.');
  assert.equal(setupHarness({ ...base, admitted: false })().props.title, 'Your night is coming.');
  const tour = setupHarness({ ...base, profileSaved: true })();
  assert.equal(tour.type, 'intro');
  assert.equal(tour.props.enabled, true);
  assert.equal(tour.props.userId, 'alice');
  assert.equal(tour.props.children.props.title, 'Who’s next?');
  assert.equal(nodes(tour).find(n => n.type === 'button').props.disabled, true, 'zero nominations cannot finish setup');
  assert.equal(setupHarness({ ...base, profileSaved: true, complete: true })().props.enabled, false);
});

test('Saving the profile enters the introduction immediately; a rejected save stays on the profile', async () => {
  for (const reject of [false, true]) {
    const base = { admitted: true, profileSaved: false, complete: false, hasPhone: true, nominations: [] };
    const calls = [];
    const render = setupHarness(base, async (name, args) => {
      calls.push({ name, args });
      if (reject) throw Error('That username is taken. Try another.');
      return { ...base, profileSaved: true };
    });
    let tree = render();
    const named = label => nodes(tree).find(n => n.props?.accessibilityLabel === label);
    named('Your name').props.onChangeText('Test Member');
    named('Username').props.onChangeText('test.member');
    named('Agree to the terms and privacy policy').props.onPress();
    tree = render();
    const button = nodes(tree).find(n => n.type === 'button');
    assert.equal(button.props.disabled, false);
    button.props.onPress();
    await flush();
    tree = render();
    assert.equal(calls[0].name, 'save_launch_profile');
    assert.equal(calls[0].args.p_name, 'Test Member');
    assert.equal(tree.type, reject ? 'shell' : 'intro');
    if (reject) assert.equal(tree.props.title, 'Make an entrance.');
    else assert.equal(tree.props.enabled, true);
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
  await api.saveIntroStep('alice', 4);
  api = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': storage });
  assert.equal(await api.readIntroStep('alice'), 4);
  // Explanation completion cannot complete the server's mandatory setup.
  const launch = load('lib/launch.ts', { '@/lib/supabase': { supabase: {} } });
  assert.equal(launch.launchStage({ admitted: true, profileSaved: false, complete: false }), 'profile');
  assert.equal(launch.launchStage({ admitted: true, profileSaved: true, complete: false, nominations: [] }), 'nominate');
});

test('Adding the social page preserves old completion and resumes new progress independently', async () => {
  const saved = new Map();
  const storage = { getItem: async k => saved.get(k) ?? null, setItem: async (k,v) => saved.set(k,v) };
  const read = () => load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': storage });
  for (const [oldStep, expected] of [['0',0],['1',1],['2',2],['3',4],['4',0],['bad',0]]) {
    saved.set('spotted.launchIntro.v1.alice', oldStep);
    assert.equal(await read().readIntroStep('alice'), expected);
  }
  saved.set('spotted.launchIntro.v1.alice', '3');
  await read().saveIntroStep('alice', 3);
  assert.equal(await read().readIntroStep('alice'), 3, 'new leaderboard progress takes precedence over legacy completion');
  assert.equal(await read().readIntroStep('bob'), 0);
  await read().saveIntroStep('alice', 4);
  assert.equal(await read().readIntroStep('alice'), 4);
});

test('Social page continues to the leaderboard; only the last page hands off to nominations', () => {
  const { INTRO_STEPS } = load('lib/launch-intro.ts', { '@react-native-async-storage/async-storage': {} });
  const element = (type, props) => ({ type, props });
  const render = extract('components/launch-introduction.tsx', 'IntroductionPages', {
    INTRO_STEPS, useState: value => [value, () => {}], useRef: value => ({current:value}), useEffect: () => {},
    useLaunchReducedMotion: () => false, LaunchReveal: 'reveal', LaunchProgress: 'progress',
    useWindowDimensions: () => ({height:874,width:402,fontScale:1}),
    Animated: { Value: function() { this.interpolate = () => 0; }, View: 'animated' },
    View: 'view', Text: 'text', ScrollView: 'scroll', Pressable: 'pressable', SpottedMark: 'mark', SymbolView: 'symbol',
    LaunchButton: 'button', CheckedInIllustration: 'checkin', MapIllustration: 'map', SocialNightIllustration: 'social', LeaderboardIllustration: 'leaderboard',
    INK: '', NEON: '', MIST: '', require: () => ({jsx:element,jsxs:element}),
  });
  const social = nodes(render({ initialStep: 2, onStep: () => {} }));
  assert.ok(social.some(n => n.type === 'social'));
  const panes=social.filter(n=>n.type==='animated');
  assert.equal(panes.length,4,'all four pages are ready before a transition');
  assert.equal(panes.filter(n=>n.props.pointerEvents==='auto').length,1);
  assert.equal(panes.filter(n=>!n.props.accessibilityElementsHidden).length,1,'offscreen pages stay out of VoiceOver');
  assert.ok(panes.every(n=>n.props.style.opacity===undefined),'pages do not fade to an empty screen');
  assert.equal(social.find(n => n.type === 'button').props.label, 'Continue');
  assert.ok(social.some(n => n.props?.accessibilityLabel === 'Introduction 3 of 4'));
  const last = nodes(render({ initialStep: 3, onStep: () => {} }));
  assert.ok(last.some(n => n.type === 'leaderboard'));
  assert.equal(last.find(n => n.type === 'button').props.label, 'Choose your two');
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
