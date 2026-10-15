const test = require('node:test');
const assert = require('node:assert/strict');
const { extract, builder, callback } = require('./product-test-runtime.cjs');

test('Member additions deduplicate IDs and propagate refusal instead of claiming success', async () => {
  const calls = [];
  const add = extract('lib/group-members.ts', 'addGroupMembers', {
    MAX_GROUP_FRIENDS: 64, supabase: { rpc: async (...args) => { calls.push(args); return { error: null }; } },
  });
  await add('thread', ['one', 'one', 'two']);
  assert.equal(calls[0][0], 'add_group_members');
  assert.deepEqual([...calls[0][1].p_members], ['one', 'two']);
  await assert.rejects(add('thread', []));
  await assert.rejects(add('', ['one']));
  const denied = { code: '42501' };
  const refuse = extract('lib/group-members.ts', 'addGroupMembers', { MAX_GROUP_FRIENDS: 64, supabase: { rpc: async () => ({ error: denied }) } });
  await assert.rejects(refuse('thread', ['one']), e => e === denied);
});

test('Removed group access returns no roster even if a concurrent member read completed earlier', async () => {
  const fetch = extract('lib/group-members.ts', 'fetchGroupMembers', {
    fetchProfilesSafe: async () => [],
    supabase: { from: table => builder({ data: table === 'dm_threads' ? null : [{ user_id: 'past-member' }], error: null }) },
  });
  assert.equal(await fetch('removed-group'), null);
});

test('Group creator cannot remove self through the UI and failed removals retain the visible roster', async () => {
  const calls = [], errors = [], state = [];
  const remove = extract('app/group-members.tsx', 'remove', {
    isCreator: true, userId: 'creator', threadId: 'group', busyRef: { current: false }, mounted: { current: true },
    setBusy: x => state.push(x), setError: x => errors.push(x),
    removeGroupMember: async (...args) => { calls.push(args); throw Error('Denied'); }, refresh: () => assert.fail('Must not claim a successful removal'),
  });
  await remove('creator'); assert.equal(calls.length, 0);
  await remove('friend'); assert.equal(calls.length, 1);
  assert.match(errors.at(-1), /Couldn’t remove/); assert.equal(state.at(-1), false);
});

test('Rapid Add taps submit once; failures retain selections and permit a retry', async () => {
  let finish, calls = 0, adding = true, selected = ['friend'];
  const scope = {
    canAdd: true, busyRef: { current: false }, mounted: { current: true }, threadId: 'group', selectedIds: ['friend'],
    setBusy() {}, setError() {}, Keyboard: { dismiss() {} }, refresh: async () => {},
    setSelected: x => { selected = x; }, setTerm() {}, setAdding: x => { adding = x; },
    addGroupMembers: () => { calls++; return new Promise((resolve, reject) => { finish = { resolve, reject }; }); },
  };
  const add = extract('app/group-members.tsx', 'addSelected', scope);
  const first = add(); await add(); assert.equal(calls, 1);
  finish.reject({ code: '42501' }); await first;
  assert.deepEqual(selected, ['friend']); assert.equal(adding, true);
  const retry = add(); finish.resolve(); await retry;
  assert.equal(selected.length, 0); assert.equal(adding, false);
});


test('An unnamed group remains in the inbox after the creator removes every other member', async () => {
  const fetch = extract('lib/dm.ts', 'fetchDmThreads', {
    supabase: { from: table => {
      let own = false;
      const q = builder(() => ({ data: table === 'dm_threads' ? [{ id: 'solo', is_group: true, name: null }] : table === 'dm_thread_members' && own ? [{ thread_id: 'solo' }] : [], error: null }));
      return new Proxy(q, { get: (target, key) => key === 'eq' ? () => { own = true; return q; } : key === 'select' ? () => new Proxy(q, { get: (t, k) => k === 'eq' ? () => { own = true; return q; } : t[k] }) : target[key] });
    } },
    fetchProfilesSafe: async () => [], isDemoMode: () => false,
    nightStartAt: () => new Date(), isFromTonight: () => true, resolvePostImageUrl: async () => null,
  });
  const threads = await fetch('creator');
  assert.equal(threads.length, 1); assert.equal(threads[0].is_group, true);
  const title = extract('lib/dm.ts', 'threadTitle');
  assert.equal(title(threads[0]), 'Group chat');
});


test('Rejoining reloads history and reconnects; removed members do not keep a live message subscription', () => {
  for (const threadAccess of ['loading', 'unavailable', 'error', 'allowed']) {
    const calls = [];
    const effect = callback('app/thread.tsx', 'useEffect', 'name: `thread-${threadId}`', {
      threadId: 'group', userId: 'member', threadAccess,
      fetchMessages: () => calls.push('history'), markThreadRead: () => calls.push('read'),
      createResilientChannel: () => { calls.push('subscribe'); return () => calls.push('unsubscribe'); },
    });
    const cleanup = effect.fn();
    assert.deepEqual(calls, threadAccess === 'allowed' ? ['history', 'read', 'subscribe'] : []);
    if (cleanup) { cleanup(); assert.equal(calls.at(-1), 'unsubscribe'); }
    assert.match(effect.deps, /threadAccess/);
  }
});
