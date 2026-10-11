const test = require('node:test');
const assert = require('node:assert/strict');
const { extract } = require('./product-test-runtime.cjs');

function sceneHarness({ reduce = false, active = true } = {}) {
  const refs = [], runs = [], effects = [];
  let cursor = 0, listener, cleanup;
  const AppState = {
    currentState: active ? 'active' : 'background',
    addEventListener: (_, fn) => { listener = fn; return { remove: () => { listener = undefined; } }; },
  };
  const render = extract('components/onboarding-scene-motion.tsx', 'useSceneMotion', {
    useLaunchReducedMotion: () => reduce,
    useRef: value => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    useEffect: effect => effects.push(effect),
    AppState, SCENE_EASE: x => 1 - (1-x)**3, Easing: { inOut: fn => fn, sin: x => x },
    Animated: {
      Value: class { constructor(v) { this.value = v; } setValue(v) { this.value = v; } },
      parallel: children => ({ start: () => children.forEach(c => c.start()), stop: () => children.forEach(c => c.stop()) }),
      timing: (time, config) => {
        const run = { config, started: false, stopped: false };
        runs.push(run);
        return { start: () => { run.started = true; }, stop: () => { run.stopped = true; } };
      },
    },
  });
  return {
    runs,
    render(enabled = true) { cursor = 0; const time = render(enabled); cleanup = effects.pop()(); return time; },
    setReduce(value) { cleanup?.(); reduce = value; },
    background() { AppState.currentState = 'background'; listener?.('background'); },
    foreground() { AppState.currentState = 'active'; listener?.('active'); },
    unmount() { cleanup?.(); },
  };
}

test('Decorative scenes finish immediately for Reduce Motion, inactive apps, and static previews', () => {
  for (const [options, enabled] of [[{ reduce: true }, true], [{ active: false }, true], [{}, false]]) {
    const h = sceneHarness(options);
    const scene = h.render(enabled);
    assert.ok([...scene.arrivals, scene.detail, scene.halo].every(v => v.value === 1));
    assert.equal(h.runs.length, 0);
  }
});

test('Leaving the app cancels the scene and returning does not replay it', () => {
  const h = sceneHarness();
  const scene = h.render();
  assert.ok(scene.arrivals.every(v => v.value === 0));
  assert.equal(h.runs[0].started, true);
  assert.equal(h.runs[0].config.useNativeDriver, true);
  assert.equal(h.runs[0].config.isInteraction, false);
  h.background();
  assert.ok(h.runs.every(run => run.stopped));
  assert.ok([...scene.arrivals, scene.detail, scene.halo].every(v => v.value === 1));
  h.foreground();
  assert.equal(h.runs.length, 8);
  h.unmount();
});

test('Enabling Reduce Motion cancels in-flight motion and disabling it does not replay', () => {
  const h = sceneHarness();
  const scene = h.render();
  h.setReduce(true);
  h.render();
  assert.ok(h.runs.every(run => run.stopped));
  assert.ok([...scene.arrivals, scene.detail, scene.halo].every(v => v.value === 1));
  h.setReduce(false);
  h.render();
  assert.equal(h.runs.length, 8);
  h.unmount();
});
