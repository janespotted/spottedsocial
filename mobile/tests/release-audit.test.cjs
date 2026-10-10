const test = require('node:test');
const assert = require('node:assert/strict');
const { load, extract, builder } = require('./product-test-runtime.cjs');

test('Activity subtitle strips a full/first sender prefix and colon without truncating another name', () => {
  const subtitle = extract('app/activity.tsx', 'subtitleFor');
  for (const [sender_name, message, expected] of [
    ['Jane Doe', 'Jane Doe: See you there', 'See you there'],
    ['Jane Doe', 'Jane: See you there', 'See you there'],
    ['Jane Doe', 'Jane liked your post', 'liked your post'],
    ['Ann', 'Anna liked your post', 'Anna liked your post'],
    [null, 'Spotted: Welcome', 'Spotted: Welcome'],
  ]) assert.equal(subtitle({ sender_name, message }), expected);
});

const picker = { launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg' }] }) };
const photoBytes = async () => ({ arrayBuffer: async () => new ArrayBuffer(4) });

test('Profile photo confirms the row before changing the avatar; denied and zero-row writes retain it', async () => {
  for (const result of [{ data: null, error: Error('denied') }, { data: null, error: null }, { data: { id: 'me', avatar_url: 'saved-url' }, error: null }]) {
    let avatar = 'prior-url', busy, alerts = 0, invalidations = 0;
    const pick = extract('app/edit-profile.tsx', 'pickAvatar', {
      userId: 'me', ImagePicker: picker, fetch: photoBytes, setUploadingAvatar: x => busy = x,
      setAvatarUrl: x => avatar = x, Alert: { alert: () => alerts++ },
      queryClient: { invalidateQueries: () => invalidations++ },
      supabase: {
        from: () => builder(result),
        storage: { from: () => ({ upload: async (path, body, options) => {
          assert.match(path, /^me\/avatar-\d+\.jpg$/);
          assert.equal(options.upsert, false, 'Denied profile save must not overwrite the old file');
          return { error: null };
        }, getPublicUrl: () => ({ data: { publicUrl: 'new-url' } }) }) },
      },
    });
    await pick();
    assert.equal(avatar, result.data ? 'saved-url' : 'prior-url');
    assert.equal(alerts, result.data ? 0 : 1);
    assert.equal(invalidations, result.data ? 1 : 0);
    assert.equal(busy, false);
  }
});

test('Group name cannot falsely report success after a denied or zero-row update', async () => {
  for (const data of [null, { id: 'thread', name: 'Saved name' }]) {
    let name = 'Before', callback, alerts = 0;
    const rename = extract('app/thread.tsx', 'renameGroup', {
      groupInfo: { name }, threadId: 'thread', supabase: { from: () => builder({ data, error: null }) },
      setGroupInfo: f => name = f({ name }).name,
      Alert: { prompt: (title, message, fn) => callback = fn, alert: () => alerts++ },
    });
    rename(); await callback('Saved name');
    assert.equal(name, data ? 'Saved name' : 'Before');
    assert.equal(alerts, data ? 0 : 1);
  }
});

test('Group photo is signed only after the stored key is confirmed', async () => {
  for (const denied of [false, true]) {
    const order = []; let photo = 'before';
    const change = extract('app/thread.tsx', 'changeGroupPhoto', {
      threadId: 'thread', ImagePicker: picker, fetch: photoBytes,
      Alert: { alert: () => order.push('error') },
      resolvePostImageUrl: async key => { assert.equal(key, 'saved-key'); order.push('sign'); return 'signed-url'; },
      setGroupInfo: f => photo = f({ group_avatar_url: photo }).group_avatar_url,
      supabase: {
        storage: { from: () => ({ upload: async () => { order.push('upload'); return { error: null }; } }) },
        from: () => builder(() => { order.push('persist'); return { data: denied ? null : { id: 'thread', group_avatar_url: 'saved-key' }, error: null }; }),
      },
    });
    await change();
    assert.deepEqual(order, denied ? ['upload', 'persist', 'error'] : ['upload', 'persist', 'sign']);
    assert.equal(photo, denied ? 'before' : 'signed-url');
  }
});

function publisher({ isDevice = false, upload = async () => ({ status: 200 }), insert = () => ({ data: { id: 'post' }, error: null }), mux = {} } = {}) {
  return load('lib/publish-post.ts', {
    'expo-file-system': { File: class { constructor(uri) { this.uri = uri; } upload(url, options) { return upload(url, options, this.uri); } } },
    'expo-device': { isDevice }, 'react-native': { Platform: { OS: 'ios' } },
    './media-prep': { prepareForUpload: async m => ({ ...m, fileExt: 'jpg', width: 10, height: 10 }) },
    './posts': { getPostExpiry: () => '2030-01-01', invalidateFeed: () => {} }, './tonight': { getActiveCity: () => 'nyc' },
    './supabase': { SUPABASE_URL: 'https://test.example', SUPABASE_PUBLISHABLE_KEY: 'test', supabase: {
      auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic' } } }) },
      from: () => builder(insert), functions: { invoke: async () => mux },
    } },
  });
}

test('Simulator uploads use foreground streaming; physical devices retain background progress/cancellation', async () => {
  for (const isDevice of [false, true]) {
    const controller = new AbortController(), progress = [];
    const api = publisher({ isDevice, upload: async (url, options) => {
      assert.equal(options.sessionType, isDevice ? 'background' : 'foreground');
      assert.equal(options.signal, controller.signal);
      assert.equal(options.headers['Content-Type'], 'image/jpeg');
      assert.equal(options.httpMethod, 'POST');
      options.onProgress({ bytesSent: 3, totalBytes: 4 });
      return { status: 200 };
    } });
    await api.uploadMedia('me/a b.jpg', { uri: 'file:///test.jpg', mimeType: 'image/jpeg' }, x => progress.push(x), controller.signal);
    assert.deepEqual(progress, [0.75, 1]);
  }
});

test('Upload rejection cannot publish a post; failed insert retries reuse the uploaded file', async () => {
  let writes = 0, uploads = 0;
  const input = { userId: 'me', text: 'Test', visibility: 'all_friends', media: { uri: 'file:///x.jpg', type: 'image', mimeType: 'image/jpeg' } };
  const denied = publisher({ upload: async () => ({ status: 403, body: '{"message":"denied"}' }), insert: () => { writes++; return {}; } });
  await assert.rejects(denied.publishPost(input), /denied/);
  assert.equal(writes, 0);
  const api = publisher({ upload: async () => { uploads++; return { status: 200 }; }, insert: () => ++writes === 1 ? { data: null, error: { message: 'offline' } } : { data: { id: 'post' }, error: null } });
  let key;
  try { await api.publishPost(input); assert.fail('Expected insert failure'); } catch (error) { key = error.uploadedKey; assert(key); }
  await api.publishPost({ ...input, uploadedKey: key });
  assert.equal(uploads, 1);
  assert.equal(writes, 2);
});

test('Unavailable video service preserves the draft without transferring bytes or inserting a post', async () => {
  const api = publisher({ mux: { error: Error('unavailable') }, upload: () => assert.fail('Must not upload'), insert: () => assert.fail('Must not insert') });
  await assert.rejects(api.publishPost({ userId: 'me', media: { uri: 'file:///video.mov', type: 'video' } }), /Couldn't start/);
});

test('DM camera resigns native keyboard again after the attachment sheet closes', async () => {
  let choice; const calls = [];
  const attach = extract('app/thread.tsx', 'attachImage', {
    dismissKeyboardNow: () => calls.push('dismiss'), sendImageAsset: () => {},
    ActionSheetIOS: { showActionSheetWithOptions: (options, fn) => choice = fn },
    setCameraOpen: open => calls.push(open ? 'camera' : 'closed'),
  });
  attach(); await choice(0);
  assert.deepEqual(calls, ['dismiss', 'dismiss', 'camera']);
});

test('Location-consent signals clear cached private views without falsely revoking shared posts', () => {
  let receive, resets = 0, mediaDrops = 0, closedPosts = 0;
  const api = load('lib/relationship-events.ts', {
    './private-media': { forgetPrivateMediaLinks: () => mediaDrops++ },
    './private-views': { PRIVATE_VIEW_KEYS: ['night-recap'], invalidatePrivateViews: () => resets++ },
    './resilient-channel': { createResilientChannel: options => {
      options.configure({ on: (type, filter, fn) => receive = fn }); return () => {};
    } },
  });
  api.onRelationshipChanged(() => closedPosts++);
  api.subscribeRelationshipEvents('me', { invalidateQueries: () => {} });
  receive({ new: { other_user_id: 'friend', kind: 'location_changed' } });
  assert.equal(resets, 1);
  assert.equal(mediaDrops, 0);
  assert.equal(closedPosts, 0);
  receive({ new: { other_user_id: 'friend', kind: 'blocked' } });
  assert.equal(mediaDrops, 1);
  assert.equal(closedPosts, 1);
});
