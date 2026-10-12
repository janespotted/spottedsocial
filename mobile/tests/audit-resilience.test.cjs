const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(n => { if (n in mocks) return mocks[n]; throw Error(n); }, module, module.exports, ...Object.values(globals));
  return module.exports;
}
function outbox() {
  let user = 'a', revision = 1, calls = 0, reject = false;
  const stored = new Map();
  const api = load('lib/dm-outbox.ts', {
    '@react-native-async-storage/async-storage': { getItem: async k => stored.get(k), setItem: async (k, v) => stored.set(k, v), removeItem: async k => stored.delete(k), getAllKeys: async () => [...stored.keys()], multiRemove: async keys => keys.forEach(k => stored.delete(k)) },
    'expo-crypto': { randomUUID: () => 'stable-id' },
    './tonight': { isFromTonight: value => value !== 'expired' },
    './session-identity': { getSessionUserId: () => user, getSessionRevision: () => revision },
    './supabase': { supabase: { rpc: async (name, args) => { calls++; assert.equal(name, 'send_dm_once'); return reject ? { error: Error('network') } : { data: [{ id: args.p_id, sender_id: user, thread_id: args.p_thread, text: args.p_text }] }; } } },
  });
  return { api, stored, change: id => { user = id; revision++; }, calls: () => calls, fail: value => { reject = value; } };
}
test('Unsent messages survive a restart as retryable rows with the same id', async () => {
  const h = outbox(), message = h.api.pendingDm('a', 'thread', 'hello');
  await h.api.savePendingDm('a', 'thread', [message]);
  const rows = await h.api.readPendingDm('a', 'thread');
  assert.equal(rows[0].id, message.id); assert.equal(rows[0].failed, true);
  assert.equal((await h.api.readPendingDm('b', 'thread')).length, 0);
});
test('Rapid local writes serialize and deletion wins', async () => {
  const h = outbox(), message = h.api.pendingDm('a', 'thread', 'hello');
  await Promise.all([h.api.savePendingDm('a', 'thread', [message]), h.api.savePendingDm('a', 'thread', [{ ...message, failed: true }]), h.api.savePendingDm('a', 'thread', [])]);
  assert.equal(h.stored.size, 0);
});
test('Queued writes and stale callbacks cannot restore messages after account switch', async () => {
  const h = outbox(), message = h.api.pendingDm('a', 'thread', 'hello');
  const pending = h.api.savePendingDm('a', 'thread', [message]); h.change('b');
  await h.api.clearPendingDms('a'); await pending;
  await h.api.savePendingDm('a', 'thread', [message]);
  assert.equal(h.stored.size, 0); await assert.rejects(h.api.deliverDm(message), /Account changed/); assert.equal(h.calls(), 0);
});
test('Expired and foreign stored messages cannot be restored or sent', async () => {
  const h = outbox();
  h.stored.set('spotted.pending-dm.v1.a.thread', JSON.stringify([{ sender_id: 'a', thread_id: 'thread', created_at: 'expired' }, { sender_id: 'b', thread_id: 'thread', created_at: 'today' }]));
  assert.equal((await h.api.readPendingDm('a', 'thread')).length, 0);
  await assert.rejects(h.api.deliverDm({ sender_id: 'a', created_at: 'expired' }), /expired/); assert.equal(h.calls(), 0);
});
test('A failed send preserves its stable id for server-idempotent retry', async () => {
  const h = outbox(), message = h.api.pendingDm('a', 'thread', 'hello');
  h.fail(true); await assert.rejects(h.api.deliverDm(message), /network/);
  h.fail(false); assert.equal((await h.api.deliverDm(message)).id, message.id); assert.equal(h.calls(), 2);
});

function captureHarness() {
  const state = []; let cursor = 0, effect, focused = true, fail = false;
  const calls = [];
  const api = load('hooks/use-private-screen.ts', {
    react: { useCallback: fn => fn, useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; } },
    'expo-router': { useFocusEffect: fn => { effect = fn; } },
    'expo-router/react-navigation': { useIsFocused: () => focused },
    'expo-screen-capture': { preventScreenCaptureAsync: async key => { calls.push('protect:' + key); if (fail) throw Error('native unavailable'); }, allowScreenCaptureAsync: async key => { calls.push('allow:' + key); } },
  });
  return { render: (key = 'dm', enabled = true) => { cursor = 0; return api.usePrivateScreen(key, enabled); }, focus: () => effect(), setFocused: x => { focused = x; }, fail: x => { fail = x; }, calls };
}
const settled = () => new Promise(setImmediate);
test('Private screen remains concealed until native protection, and blur releases the lock', async () => {
  const h = captureHarness(); assert.equal(h.render().ready, false); const blur = h.focus();
  assert.equal(h.render().ready, false); await settled(); assert.equal(h.render().ready, true);
  h.setFocused(false); assert.equal(h.render().ready, false); blur(); await settled();
  assert.deepEqual(h.calls, ['protect:dm', 'allow:dm']);
  assert.equal(h.render('plans', false).ready, true); h.focus(); await settled(); assert.equal(h.calls.length, 2);
});
test('Native protection failure stays closed and offers a working retry', async () => {
  const h = captureHarness(); h.fail(true); h.render(); const blur = h.focus(); await settled();
  const failed = h.render(); assert.equal(failed.ready, false); assert.equal(failed.failed, true);
  failed.retry(); blur(); h.fail(false); h.render(); h.focus(); await settled();
  assert.equal(h.render().ready, true); assert.equal(h.render().failed, false);
});


test('Five tabs share one clock, recompute on foreground, and release the timer', () => {
  let now = Date.parse('2026-10-12T21:59:20Z'), appListener, appRemoved = 0, scheduleCount = 0;
  const jobs = new Map(), subscriptions = [], selectors = [];
  class ClockDate extends Date { static now() { return now; } }
  const tonight = load('lib/tonight.ts', {});
  const clock = load('lib/night-clock.ts', {
    react: { useCallback: fn => fn, useSyncExternalStore: (subscribe, select) => { subscriptions.push(subscribe); selectors.push(select); return select(); } },
    'react-native': { AppState: { addEventListener: (_, fn) => { appListener = fn; return { remove: () => appRemoved++ }; } } },
    './tonight': tonight,
  }, { Date: ClockDate, setTimeout: (fn, delay) => { const id = ++scheduleCount; jobs.set(id, { fn, delay }); return id; }, clearTimeout: id => jobs.delete(id) });
  for (let i = 0; i < 5; i++) assert.equal(clock.useClockNight('nyc'), false);
  const clean = subscriptions.map(subscribe => subscribe(() => {}));
  assert.equal(jobs.size, 1); assert.equal(scheduleCount, 1); assert.equal([...jobs.values()][0].delay, 40020);
  now = Date.parse('2026-10-12T22:01:00Z'); appListener('active');
  assert(selectors.every(select => select())); assert.equal(jobs.size, 1);
  now = Date.parse('2026-10-13T09:00:00Z'); appListener('active');
  assert(selectors.every(select => !select()));
  for (const dispose of clean) dispose(); assert.equal(jobs.size, 0); assert.equal(appRemoved, 1);
});
