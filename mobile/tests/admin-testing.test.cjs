const test = require('node:test'), assert = require('node:assert/strict');
const { compile, source, load } = require('./product-test-runtime.cjs');
const { createClient } = require('@supabase/supabase-js');
const globals = { URL, URLSearchParams, Headers, Response, Request };
const time = load('lib/tonight.ts');
const { DemoSandbox, demoId } = compile(source('lib/demo-sandbox.ts'), { ...globals, require: n => { assert.equal(n, './tonight'); return time; } });
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seed = { userId, name: 'Admin', username: 'admin', city: 'nyc' };
function sandbox() {
 const store = new DemoSandbox(seed);
 const db = createClient('https://demo.invalid', 'public-test-key', { global: { fetch: store.fetch.bind(store) }, auth: { persistSession: false, autoRefreshToken: false } });
 return { store, db };
}
test('Demo data populates friends, posts, plans, direct messages and activity through the real client', async () => {
 const { db } = sandbox();
 for (const [table, count] of [['friendships', 24], ['posts', 8], ['plans', 4], ['dm_threads', 6], ['notifications', 1]]) {
  const r = await db.from(table).select('*'); assert.equal(r.error, null, table); assert.equal(r.data.length, count, table);
 }
 const own = await db.rpc('get_own_night_status').maybeSingle(); assert.equal(own.error, null); assert.equal(own.data.user_id, userId);
});
test('Demo No reveals counts only; TBD restores sample friend identities', async () => {
 const { db } = sandbox(); await db.rpc('commit_night_status', { p_patch: { status: 'home' } });
 assert.deepEqual((await db.rpc('get_friends_night_counts')).data, { out: 12, planning: 8 });
 assert.equal((await db.from('night_statuses').select('*').neq('user_id', userId)).data.length, 0);
 assert((await db.rpc('get_profiles_safe')).data.filter(p => p.id !== userId).every(p => p.last_known_lat === null && !p.is_out));
 await db.rpc('commit_night_status', { p_patch: { status: 'planning' } });
 assert.equal((await db.from('night_statuses').select('*').neq('user_id', userId)).data.length, 24);
});
test('Demo Day blocks a night check-in; Night restores it without changing another store', async () => {
 const { db } = sandbox(), other = sandbox();
 await db.rpc('set_night_mode_override', { p_mode: 'day' });
 assert((await db.rpc('commit_night_status', { p_patch: { status: 'out' } })).error);
 assert.equal((await other.db.rpc('get_night_mode')).data.override, 'night');
 await db.rpc('set_night_mode_override', { p_mode: 'night' });
 assert.equal((await db.rpc('commit_night_status', { p_patch: { status: 'out' } })).error, null);
});
test('Demo posts can be created, liked, commented on and deleted locally', async () => {
 const { db } = sandbox();
 const saved = await db.from('posts').insert({ user_id: userId, text: 'A demo post' }).select('*').single();
 assert.equal(saved.error, null); const id = saved.data.id;
 await db.from('post_likes').insert({ post_id: id, user_id: userId });
 await db.from('post_comments').insert({ post_id: id, user_id: userId, text: 'A sample comment' });
 assert.equal((await db.from('post_likes').select('*').eq('post_id', id)).data.length, 1);
 await db.from('posts').delete().eq('id', id);
 assert.equal((await db.from('posts').select('*').eq('id', id).maybeSingle()).data, null);
});
test('Demo plan creation and editing preserve selected venue and participants', async () => {
 const { db } = sandbox(); const values = { venue_id: demoId(10), plan_date: time.getNightKey(), plan_time: '21:30', visibility: 'friends' };
 const created = await db.rpc('save_plan', { p_id: null, p_values: values, p_participants: [demoId(1)] });
 assert.equal(created.error, null);
 assert.equal((await db.from('plans').select('*').eq('id', created.data).single()).data.venue_name, 'Gospel');
 assert.equal((await db.rpc('save_plan', { p_id: created.data, p_values: { ...values, plan_time: '22:00' }, p_participants: [demoId(2)] })).error, null);
 assert.equal((await db.from('plan_participants').select('*').eq('plan_id', created.data)).data[0].user_id, demoId(2));
});
test('Demo DM retry is idempotent and invited card acceptance updates Activity', async () => {
 const { db } = sandbox(); const thread = (await db.rpc('create_dm_thread', { friend_id: demoId(1) })).data;
 const input = { p_id: demoId(900), p_thread: thread, p_text: 'Hello', p_image: null };
 await db.rpc('send_dm_once', input); await db.rpc('send_dm_once', input);
 assert.equal((await db.from('dm_messages').select('*').eq('id', demoId(900))).data.length, 1);
 const invite = (await db.from('invites').select('*').eq('receiver_id', userId).single()).data;
 assert.equal((await db.rpc('respond_to_invite', { p_invite: invite.id, p_accept: true })).data.status, 'accepted');
 assert.equal((await db.from('notifications').select('*').eq('receiver_id', userId)).data[0].data.status, 'accepted');
});
test('Demo Meet Up and venue invite create cards; Undo removes only its own pending request', async () => {
 const { db } = sandbox();
 const r = await db.rpc('send_meetup', { p_receiver: demoId(1) }); assert.equal(r.data[0].result, 'sent');
 assert.equal((await db.rpc('withdraw_invites', { p_ids: [r.data[0].invite_id] })).data, 1);
 const invite = await db.rpc('send_venue_invites', { p_venue_id: demoId(10), p_receivers: [demoId(2)] });
 assert.equal(invite.data[0].created, true);
});
test('Unknown RPCs, auth changes, uploads and Edge Functions are refused by the sandbox', async () => {
 const { db, store } = sandbox();
 assert.equal((await db.rpc('delete_my_account')).error.code, 'DEMO_ONLY');
 for (const path of ['/functions/v1/send-push', '/storage/v1/object/post-images/test', '/auth/v1/user']) assert.equal((await store.fetch('https://demo.invalid' + path, { method: 'POST', body: '{}' })).status, 400);
});
function modeHarness() {
 let id = userId, revision = 0; const listeners = [], network = [];
 const identity = { getSessionUserId: () => id, onSessionIdentityChange: cb => listeners.push(cb), resetSessionDataScope: () => { revision++; listeners.forEach(f => f()); }, sessionFetch: async (input, init, transport) => transport ? transport(input, init) : (network.push(String(input)), new Response('{}')) };
 const api = compile(source('lib/demo-mode.ts'), { ...globals, require: n => ({ react: { useSyncExternalStore() {} }, './demo-sandbox': { DemoSandbox }, './session-identity': identity })[n] });
 return { api, network, change: next => { id = next; identity.resetSessionDataScope(); }, revision: () => revision };
}
test('Demo requires trusted account access, never restores a saved switch and resets on account change', async () => {
 const h = modeHarness(); await h.api.hydrateDemoMode(); assert.equal(h.api.isDemoMode(), false);
 await assert.rejects(h.api.setDemoMode(true, seed), /Admin/);
 h.api.setDemoAuthorization(true); assert.equal(h.api.isDemoMode(), false);
 await h.api.setDemoMode(true, seed); assert.equal(h.api.isDemoMode(), true); assert.equal(h.revision(), 1);
 h.change('another'); assert.equal(h.api.isDemoMode(), false); assert.equal(h.api.getDemoSandbox(), null);
});
test('Demo blocks all outgoing data traffic; exit discards edits and rejects stale sample writes', async () => {
 const h = modeHarness(); h.api.setDemoAuthorization(true); await h.api.setDemoMode(true, seed);
 const db = createClient('https://demo.invalid', 'test-key', { global: { fetch: h.api.appFetch }, auth: { persistSession: false, autoRefreshToken: false } });
 await db.from('posts').insert({ user_id: userId, text: 'local only' });
 await db.rpc('send_dm_once', { p_id: demoId(900), p_thread: demoId(1), p_text: 'local only' });
 await db.functions.invoke('send-push', { body: { message: 'must not leave' } });
 assert.equal(h.network.length, 0);
 await db.rpc('get_launch_state'); assert.equal(h.network.length, 1, 'read-only capability check stays real');
 await h.api.setDemoMode(false); assert.equal(h.api.getDemoSandbox(), null);
 const stale = await db.from('posts').insert({ user_id: demoId(1), text: 'stale' }); assert.equal(stale.error.code, 'DEMO_ENDED'); assert.equal(h.network.length, 1);
 await h.api.setDemoMode(true, seed); assert.equal(h.api.getDemoSandbox().tables.posts.length, 8);
});
const preview = load('lib/onboarding-preview.ts');
test('Demo read receipts and messages do not revoke an open chat, while membership removal still does', async () => {
 const { db, store } = sandbox();
 const { createResilientChannel } = load('lib/resilient-channel.ts', {
  './demo-mode': { getDemoSandbox: () => store }, 'react-native': {},
  './supabase': { supabase: { channel: () => assert.fail('Demo must not open a socket') } },
 });
 let revocations = 0, messages = 0, receipts = 0;
 const subscribe = (table, fn) => createResilientChannel({ name: table, onReconnect: fn,
  configure: ch => ch.on('postgres_changes', { table, event: '*', schema: 'public' }, fn) });
 const stops = [subscribe('relationship_events', () => revocations++), subscribe('dm_messages', () => messages++), subscribe('dm_read_receipts', () => receipts++)];
 const group = store.tables.dm_threads.find(t => t.is_group && t.created_by === userId);
 for (let i = 0; i < 3; i++) await db.from('dm_read_receipts').upsert({ user_id: userId, thread_id: group.id, last_read_at: new Date().toISOString() }, { onConflict: 'user_id,thread_id' });
 assert.equal(receipts, 3); assert.equal(revocations, 0); assert.equal(messages, 0);
 await db.rpc('send_dm_once', { p_thread: group.id, p_id: demoId(903), p_text: 'Hi everyone' });
 assert.equal(messages, 1); assert.equal(revocations, 0);
 await db.rpc('remove_group_member', { p_thread: group.id, p_member: demoId(1) });
 assert.equal(revocations, 1);
 stops.forEach(stop => stop());
 await db.from('dm_read_receipts').insert({ user_id: userId, thread_id: group.id });
 assert.equal(receipts, 3);
});
test('Demo typing never opens a live presence connection', () => {
 const { callback } = require('./product-test-runtime.cjs');
 const effect = callback('hooks/use-typing-indicator.ts', 'useEffect', 'supabase.channel', {
  threadId: demoId(1000), userId, demoOn: true,
  supabase: { channel: () => assert.fail('Sample typing must not leave the phone') },
 });
 assert.equal(effect.fn(), undefined); assert.match(effect.deps, /demoOn/);
});
test('All 24 demo friends can be selected in both group pickers, without exposing samples in live mode', async () => {
 const { store } = sandbox();
 const { queryFunction } = require('./product-test-runtime.cjs');
 for (const file of ['app/new-group.tsx', 'app/group-members.tsx']) {
  for (const demo of [true, false]) {
   const fetch = queryFunction(file, 'new-group-friends', {
    userId, friendship: { data: store.tables.friendships.map(f => f.friend_id) },
    isDemoMode: () => demo, fetchProfilesSafe: async () => store.tables.profiles,
   });
   assert.equal((await fetch()).length, demo ? 24 : 0, file);
  }
 }
});
test('Demo groups support create, rename, add, remove and message; a DM never reuses a group', async () => {
 const { db } = sandbox();
 const group = await db.rpc('create_group_thread', { member_ids: [demoId(1), demoId(104)], group_name: '  New crew  ' });
 assert.equal(group.error, null);
 assert.equal((await db.from('dm_threads').select('*').eq('id', group.data).single()).data.name, 'New crew');
 const dm = await db.rpc('create_dm_thread', { friend_id: demoId(104) });
 assert.notEqual(dm.data, group.data);
 assert.equal((await db.from('dm_threads').select('*').eq('id', dm.data).single()).data.is_group, false);
 await db.from('dm_threads').update({ name: 'Friday plans' }).eq('id', group.data);
 assert.equal((await db.from('dm_threads').select('*').eq('id', group.data).single()).data.name, 'Friday plans');
 assert.equal((await db.rpc('add_group_members', { p_thread: group.data, p_members: [demoId(105), demoId(105)] })).error, null);
 assert.equal((await db.from('dm_thread_members').select('*').eq('thread_id', group.data)).data.length, 4);
 assert.equal((await db.rpc('remove_group_member', { p_thread: group.data, p_member: demoId(1) })).error, null);
 assert.equal((await db.from('dm_thread_members').select('*').eq('thread_id', group.data)).data.length, 3);
 const sent = await db.rpc('send_dm_once', { p_id: demoId(901), p_thread: group.data, p_text: 'On my way' });
 assert.equal(sent.error, null); assert.equal(sent.data[0].text, 'On my way');
});
test('Demo group permissions reject strangers, invalid groups and edits to another creator’s roster', async () => {
 const { db, store } = sandbox();
 const other = store.tables.dm_threads.find(t => t.is_group && t.created_by !== userId);
 const owned = store.tables.dm_threads.find(t => t.is_group && t.created_by === userId);
 const before = JSON.stringify(store.tables.dm_thread_members);
 for (const [rpc, args] of [
  ['create_group_thread', { member_ids: [demoId(1)] }],
  ['create_group_thread', { member_ids: [demoId(1), 'stranger'] }],
  ['create_group_thread', { member_ids: [demoId(1), demoId(2)], group_name: 'a'.repeat(101) }],
  ['add_group_members', { p_thread: other.id, p_members: [demoId(2)] }],
  ['remove_group_member', { p_thread: other.id, p_member: demoId(105) }],
  ['remove_group_member', { p_thread: owned.id, p_member: userId }],
  ['send_dm_once', { p_id: demoId(902), p_thread: 'missing', p_text: 'No' }],
 ]) assert((await db.rpc(rpc, args)).error, rpc);
 assert.equal(JSON.stringify(store.tables.dm_thread_members), before);
});
test('Demo group photos stay on device, resolve only in their session and disappear after reset', async () => {
 const { store } = sandbox();
 const group = store.tables.dm_threads.find(t => t.is_group);
 const uri = 'file:///demo-picker/photo.jpg';
 const key = store.saveGroupPhoto(group.id, uri);
 assert.equal(group.group_avatar_url, key); assert.equal(store.resolveMedia(key), uri);
 const { extract } = require('./product-test-runtime.cjs');
 let current = store;
 const resolve = extract('lib/posts.ts', 'resolvePostImageUrl', { getDemoSandbox: () => current, resolvePostImageUrls: () => assert.fail('Local photo must not request a server link') });
 assert.equal(await resolve(key), uri);
 current = null; assert.equal(await resolve(key), null);
 assert.throws(() => store.saveGroupPhoto(group.id, 'https://example.com/photo.jpg'));
 store.reset(); assert.equal(store.resolveMedia(key), null);
 const newKey = store.saveGroupPhoto(store.tables.dm_threads.find(t => t.is_group).id, uri);
 assert.notEqual(newKey, key);
});
test('Native demo photo selection never uploads and cannot finish into a different session', async () => {
 const { extract } = require('./product-test-runtime.cjs');
 for (const exitDuringPicker of [false, true]) {
  const { store } = sandbox(); let current = store, shown = null;
  const group = store.tables.dm_threads.find(t => t.is_group);
  const change = extract('app/thread.tsx', 'changeGroupPhoto', {
   threadId: group.id, getDemoSandbox: () => current,
   ImagePicker: { launchImageLibraryAsync: async () => {
    if (exitDuringPicker) current = null;
    return { canceled: false, assets: [{ uri: 'file:///local/test.jpg' }] };
   } },
   setGroupInfo: f => { shown = f({}).group_avatar_url; },
   fetch: () => assert.fail('Demo must never upload'),
   supabase: { storage: { from: () => assert.fail('Demo must never access storage') } },
   Alert: { alert: () => assert.fail('Demo photo should work') },
  });
  await change(); assert.equal(shown, exitDuringPicker ? null : 'file:///local/test.jpg');
  assert.equal(group.group_avatar_url === null, exitDuringPicker);
 }
});
test('Onboarding preview enforces profile and two distinct nominations using only local state', () => {
 const original = preview.previewLaunchState();
 assert.throws(() => preview.previewLaunchAction(original, 'complete_launch_onboarding'));
 let state = preview.previewLaunchAction(original, 'save_launch_profile', { p_name: 'Sample Admin', p_username: 'sample', p_terms: true });
 state = preview.previewLaunchAction(state, 'save_launch_nomination', { p_slot: 1, p_phone: '+12025550101' });
 assert.throws(() => preview.previewLaunchAction(state, 'save_launch_nomination', { p_slot: 2, p_phone: '+12025550101' }));
 assert.throws(() => preview.previewLaunchAction(state, 'complete_launch_onboarding'));
 state = preview.previewLaunchAction(state, 'save_launch_nomination', { p_slot: 2, p_phone: '+12025550102' });
 assert.equal(preview.previewLaunchAction(state, 'complete_launch_onboarding').complete, true);
 assert.equal(original.profileSaved, false); assert.equal(original.nominations.length, 0);
 assert.throws(() => preview.previewLaunchAction(state, 'delete-account'));
});
test('A query built in Demo cannot escape to live data after Exit, even if started later', async () => {
 let current = new DemoSandbox(seed), network = 0;
 const net = async () => { network++; return new Response('[]'); };
 const boundCreate = (...args) => { const client = createClient(...args); client.auth.startAutoRefresh = () => {}; return client; };
 const api = compile(source('lib/supabase.ts'), { ...globals, process: { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://demo.invalid', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key' } }, require: n => ({
  'react-native-url-polyfill/auto': {}, 'react-native': { AppState: { addEventListener() {} } },
  '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } },
  '@supabase/supabase-js': { createClient: boundCreate },
  './demo-mode': { appFetch: net, getDemoSandbox: () => current },
  './session-identity': { sessionFetch: (url, options, transport) => (transport || net)(url, options) },
 })[n] });
 const pending = api.supabase.from('posts').insert({ user_id: userId, text: 'Not a real post' }).select('*');
 current = null;
 const result = await pending;
 assert(result.error); assert.equal(network, 0);
});

test('Demo nominations return two stable fictional examples through the actual RPC client', async () => {
 const { db } = sandbox();
 const first = await db.rpc('get_my_nomination_progress');
 assert.equal(first.error, null);
 assert.deepEqual(first.data.nominations.map(n => n.slot), [1, 2]);
 assert.deepEqual(first.data.nominations.map(n => n.phone), ['+12025550101', '+12025550102']);
 assert.deepEqual(first.data.nominations.map(n => n.status), ['waiting', 'invited']);
 assert.deepEqual((await db.rpc('get_my_nomination_progress')).data, first.data);
 assert.equal((await db.from('notifications').select('*')).data.length, 1, 'Viewing nominations must not send an invitation');
});
