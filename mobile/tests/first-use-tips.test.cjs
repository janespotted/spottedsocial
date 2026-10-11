const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./product-test-runtime.cjs');

function tips(storage) {
  return load('lib/first-use-tips.ts', { '@react-native-async-storage/async-storage': storage });
}

test('Dismissing a tip persists across restarts without hiding another account or feature', async () => {
  const saved = new Map();
  const storage = { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => saved.set(key, value) };
  let api = tips(storage);
  assert.equal(await api.shouldShowTip('alice', 'status'), true);
  await api.dismissTip('alice', 'status');
  api = tips(storage);
  assert.equal(await api.shouldShowTip('alice', 'status'), false);
  assert.equal(await api.shouldShowTip('bob', 'status'), true);
  assert.equal(await api.shouldShowTip('alice', 'map'), true);
});

test('An in-flight preference read cannot revive a tip dismissed in the meantime', async () => {
  let finish;
  const api = tips({ getItem: () => new Promise(resolve => { finish = resolve; }), setItem: async () => {} });
  const visible = api.shouldShowTip('alice', 'map');
  await api.dismissTip('alice', 'map');
  finish(null);
  assert.equal(await visible, false);
});

test('Unavailable preference storage never blocks the app or revives a dismissed tip', async () => {
  const api = tips({ getItem: async () => { throw Error('read unavailable'); }, setItem: async () => { throw Error('write unavailable'); } });
  assert.equal(await api.shouldShowTip('alice', 'recap'), false);
  await assert.doesNotReject(api.dismissTip('alice', 'recap'));
  assert.equal(await api.shouldShowTip('alice', 'recap'), false);
});
