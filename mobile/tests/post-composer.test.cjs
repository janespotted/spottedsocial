const test = require('node:test');
const assert = require('node:assert/strict');
const { extract } = require('./product-test-runtime.cjs');

class PublishError extends Error {
  constructor(message, uploadedKey = null, cancelled = false) {
    super(message); this.uploadedKey = uploadedKey; this.cancelled = cancelled;
  }
}

function composer(publishPost, overrides = {}) {
  const state = { errors: [], phases: [], shared: [], closed: 0 };
  const scope = {
    session: { user: { id: 'test-owner' } }, posting: false,
    caption: 'A draft worth keeping', venueName: 'Test venue', venueId: null,
    visibility: 'close_friends', taggedFriends: [],
    media: { uri: 'file:///synthetic.mp4', type: 'video' },
    uploadedRef: { current: null }, abortRef: { current: null },
    validatePostText: value => ({ success: true, data: value }),
    validateVenueName: value => ({ success: true, data: value }),
    AbortController, PublishError, publishPost,
    setError: value => state.errors.push(value), setPhase: value => state.phases.push(value),
    setProgress: () => {}, savePostAudience: () => {},
    onShared: value => state.shared.push(value), onClose: () => state.closed++,
    ...overrides,
  };
  return {
    state, scope,
    share: extract('components/post-composer.tsx', 'share', scope),
    close: extract('components/post-composer.tsx', 'close', scope),
  };
}

test('Two Share taps before a render start only one publication', async () => {
  let finish, calls = 0;
  const h = composer(() => { calls++; return new Promise(resolve => finish = resolve); });
  const first = h.share();
  const second = h.share();
  assert.equal(calls, 1);
  finish({ post: { id: 'published-once' } });
  await Promise.all([first, second]);
  assert.equal(h.state.shared.length, 1);
});

test('A text-only post publishes without media and retains its audience and venue', async () => {
  let input;
  const h = composer(async value => { input = value; return { post: { id: 'text-only' } }; }, { media: null });
  await h.share();
  assert.equal(input.media, null);
  assert.equal(input.text, 'A draft worth keeping');
  assert.equal(input.visibility, 'close_friends');
  assert.equal(input.venueName, 'Test venue');
  assert.equal(h.state.phases[0], 'publishing');
  assert.equal(h.state.shared[0].id, 'text-only');
});

test('An empty text-only draft cannot publish', async () => {
  let calls = 0;
  const h = composer(async () => { calls++; }, { media: null, caption: '' });
  await h.share();
  assert.equal(calls, 0);
  assert.equal(h.state.shared.length, 0);
  assert.equal(h.state.errors.at(-1).retryable, false);
});

test('A failed text post retains its content and can retry without an upload', async () => {
  const inputs = [];
  const h = composer(async value => {
    inputs.push(value);
    if (inputs.length === 1) throw new PublishError('Offline');
    return { post: { id: 'text-retry' } };
  }, { media: null });
  await h.share();
  assert.equal(h.state.errors.at(-1).retryable, true);
  await h.share();
  assert.equal(inputs[1].text, inputs[0].text);
  assert.equal(inputs[1].visibility, inputs[0].visibility);
  assert.equal(inputs[1].uploadedKey, null);
  assert.equal(h.state.shared.length, 1);
});

test('Close immediately after Share cancels the in-flight attempt and retains the draft', async () => {
  let signal;
  const h = composer(input => {
    signal = input.signal;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new PublishError('Cancelled', null, true))));
  });
  const pending = h.share();
  h.close();
  assert.equal(signal.aborted, true);
  await pending;
  assert.equal(h.state.closed, 0);
  assert.equal(h.state.errors.filter(Boolean).length, 0);
  assert.equal(h.scope.abortRef.current, null);
});

test('A failed publication retries using its uploaded media and retains caption, venue and audience', async () => {
  const inputs = [];
  const h = composer(async input => {
    inputs.push(input);
    if (inputs.length === 1) throw new PublishError('Offline', 'uploaded-video');
    return { post: { id: 'retry-success' } };
  });
  await h.share();
  assert.equal(h.state.errors.at(-1).retryable, true);
  assert.equal(h.scope.abortRef.current, null);
  await h.share();
  assert.equal(inputs[1].uploadedKey, 'uploaded-video');
  for (const key of ['text', 'venueName', 'visibility', 'media']) assert.deepEqual(inputs[1][key], inputs[0][key]);
  assert.equal(h.state.shared.length, 1);
});

test('Unavailable video service leaves the composer retryable without showing success', async () => {
  const h = composer(async () => { throw new PublishError("Couldn't start the video upload."); });
  await h.share();
  assert.equal(h.state.shared.length, 0);
  assert.equal(h.state.phases.at(-1), null);
  assert.equal(h.scope.uploadedRef.current, null);
  assert.equal(h.scope.abortRef.current, null);
  assert.equal(h.state.errors.at(-1).message, "Couldn't start the video upload.");
  assert.equal(h.state.errors.at(-1).retryable, true);
});
