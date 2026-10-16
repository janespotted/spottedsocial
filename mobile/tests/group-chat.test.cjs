const test = require('node:test');
const assert = require('node:assert/strict');
const { extract, queryFunction } = require('./product-test-runtime.cjs');

const creator = rpc => extract('lib/dm.ts', 'createGroupThread', { supabase: { rpc }, MAX_GROUP_FRIENDS: 64 });

test('Group creation sends distinct friends and a trimmed optional name to the atomic RPC', async () => {
  const calls = [];
  const create = creator(async (...args) => { calls.push(args); return { data: 'group-id', error: null }; });
  assert.equal(await create(['one', 'two', 'one'], '  Friday crew  '), 'group-id');
  assert.equal(calls[0][0], 'create_group_thread');
  assert.deepEqual(Array.from(calls[0][1].member_ids), ['one', 'two']);
  assert.equal(calls[0][1].group_name, 'Friday crew');
  await create(['one', 'two'], '   ');
  assert.equal(calls[1][1].group_name, undefined);
});

test('Groups reject too few distinct friends, excessive membership and oversized names before creating anything', async () => {
  const create = creator(() => assert.fail('Invalid groups must not call the backend'));
  for (const ids of [[], ['one'], ['one', 'one'], ['one', ''], Array.from({ length: 65 }, (_, i) => `person-${i}`)]) {
    await assert.rejects(create(ids));
  }
  await assert.rejects(create(['one', 'two'], 'a'.repeat(101)));
});

test('A denied or empty group response never produces a conversation ID', async () => {
  const denied = { code: '42501', message: 'These members cannot share a group' };
  await assert.rejects(creator(async () => ({ error: denied, data: null }))(['one', 'two']), e => e === denied);
  for (const data of [null, '', {}, []]) {
    await assert.rejects(creator(async () => ({ error: null, data }))(['one', 'two']));
  }
});

function sheet(createGroupThread) {
  const state = { errors: [], busy: [], navigated: [], invalidated: [] };
  const scope = {
    canCreate: true, creatingRef: { current: false }, mounted: { current: true },
    selectedFriends: [{ id: 'one' }, { id: 'two' }], name: 'Friday crew', userId: 'me',
    setCreating: x => state.busy.push(x), setError: x => state.errors.push(x), Keyboard: { dismiss() {} },
    queryClient: { invalidateQueries: x => state.invalidated.push(x) },
    router: { replace: x => state.navigated.push(x) }, createGroupThread,
  };
  return { state, scope, create: extract('app/new-group.tsx', 'createGroup', scope) };
}

test('Two rapid Create taps start one group and open the returned conversation', async () => {
  let finish, calls = 0;
  const h = sheet(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = h.create();
  await h.create();
  assert.equal(calls, 1);
  finish('created-group');
  await first;
  assert.equal(h.state.navigated.length, 1);
  assert.equal(h.state.navigated[0].params.threadId, 'created-group');
  assert.equal(h.state.invalidated.length, 1);
});

test('Failed creation preserves selected friends and name and can be retried', async () => {
  let attempt = 0;
  const h = sheet(async () => { if (++attempt === 1) throw { code: '42501' }; return 'retry-group'; });
  await h.create();
  assert.equal(h.state.navigated.length, 0);
  assert.match(h.state.errors.at(-1), /can’t share a group/);
  assert.equal(h.scope.selectedFriends.length, 2);
  assert.equal(h.scope.name, 'Friday crew');
  assert.equal(h.scope.creatingRef.current, false);
  await h.create();
  assert.equal(h.state.navigated[0].params.threadId, 'retry-group');
});

test('A completed request cannot navigate after the sheet has unmounted', async () => {
  let finish;
  const h = sheet(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.create();
  h.scope.mounted.current = false;
  finish('group-after-close');
  await pending;
  assert.equal(h.state.navigated.length, 0);
});

test('Group picker includes current real friends, retaining different friends with the same name', async () => {
  const friends = [
    { id: 'one', display_name: 'Alex', is_demo: false },
    { id: 'two', display_name: 'Alex', is_demo: false },
    { id: 'demo', display_name: 'Demo', is_demo: true },
    { id: 'stranger', display_name: 'Stranger', is_demo: false },
    { id: 'me', display_name: 'Me', is_demo: false },
  ];
  const fetch = queryFunction('app/new-group.tsx', 'new-group-friends', {
    isDemoMode: () => false, userId: 'me', friendship: { data: ['one', 'two', 'demo', 'me'] }, fetchProfilesSafe: async () => friends,
  });
  assert.deepEqual((await fetch()).map(f => f.id), ['one', 'two']);
});
