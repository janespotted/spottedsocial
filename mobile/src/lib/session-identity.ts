/** Synchronous security boundary, independent of React render/effect timing. */
let userId: string | null = null;
let accessToken: string | null = null;
let revision = 0;
const listeners = new Set<() => void>();
const tokenListeners = new Set<() => void>();
const requests = new Set<AbortController>();

export const getSessionRevision = () => revision;
export const getSessionUserId = () => userId;
export const getSessionAccessToken = () => accessToken;
export function onSessionIdentityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function onSessionTokenChange(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => { tokenListeners.delete(listener); };
}
export function setSessionIdentity(id: string | null, token: string | null): void {
  const tokenChanged = accessToken !== token;
  accessToken = token;
  if (id === userId) {
    if (tokenChanged) for (const listener of tokenListeners) listener();
    return;
  } // Token refresh must not reset navigation or caches.
  userId = id;
  revision += 1;
  for (const request of requests) request.abort();
  requests.clear();
  for (const listener of listeners) listener();
  if (tokenChanged) for (const listener of tokenListeners) listener();
}
export function assertSessionRevision(captured: number): void {
  if (captured !== revision) throw new Error('Account changed; discard the previous account response');
}

/** Reject delayed responses even when the underlying transport ignores abort. */
export async function sessionFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const captured = revision;
  const controller = new AbortController();
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  requests.add(controller);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    assertSessionRevision(captured);
    // Headers may arrive before a slow body. Guard the decoding boundary too.
    for (const method of ['json', 'text', 'blob', 'arrayBuffer', 'formData'] as const) {
      const decode = response[method].bind(response);
      Object.defineProperty(response, method, { value: async () => {
        assertSessionRevision(captured);
        const body = await decode();
        assertSessionRevision(captured);
        return body;
      } });
    }
    return response;
  } finally {
    requests.delete(controller);
    signal?.removeEventListener('abort', abort);
  }
}
