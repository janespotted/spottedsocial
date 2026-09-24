import { createPrivateKey } from 'node:crypto';
/** Authenticated byte gateway. Provider tokens and URLs never reach the client. */
export interface MediaTarget { bucket?: string; path?: string; playback_id?: string; expires_at?: string }
export interface Capsule { playback: string; url: string; expires: number }
export interface MediaDependencies {
  endpoint: string;
  authorize(req: Request, path: string | null, playback: string | null): Promise<MediaTarget | null>;
  storage(path: string): { url: string; headers: Record<string, string> };
  mux(playback: string, kind: string, expires: number): Promise<string>;
  seal(value: Capsule): Promise<string>;
  open(value: string): Promise<Capsule>;
  fetch: typeof fetch;
  now?: () => number;
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, range', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges' };
const headers = { ...cors, 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' };
export function muxUrl(value: string): URL {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.mux.com') || u.port || u.username || u.password) throw Error('Invalid provider URL');
  return u;
}
export async function rewriteManifest(text: string, base: string, wrap: (url: string) => Promise<string>): Promise<string> {
  const result: string[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() && !line.startsWith('#')) result.push(await wrap(new URL(line.trim(), base).href));
    else {
      let out = '', end = 0;
      for (const match of line.matchAll(/URI="([^"]+)"/g)) {
        out += line.slice(end, match.index) + `URI="${await wrap(new URL(match[1], base).href)}"`;
        end = match.index! + match[0].length;
      }
      result.push(out + line.slice(end));
    }
  }
  return result.join('\n');
}
export function mediaHandler(deps: MediaDependencies) {
  return async (req: Request): Promise<Response> => {
    const fail = (status: number) => new Response(null, { status, headers });
    if (req.method === 'OPTIONS') return fail(204);
    if (!['GET', 'HEAD'].includes(req.method)) return fail(405);
    if (!/^Bearer \S+$/i.test(req.headers.get('Authorization') ?? '')) return fail(401);
    try {
      const url = new URL(req.url), now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
      let path = url.searchParams.get('path'), playback = url.searchParams.get('playback_id');
      const cap = url.searchParams.get('resource');
      let capsule: Capsule | null = null;
      if (cap) {
        capsule = await deps.open(cap);
        if (capsule.expires <= now) return fail(404);
        playback = capsule.playback; path = null;
        muxUrl(capsule.url);
      }
      if ((!path && !playback) || (path && playback)) return fail(400);
      // Every manifest, key, thumbnail and segment rechecks CURRENT parent access.
      const target = await deps.authorize(req, path, playback);
      if (!target) return fail(404);
      const range = req.headers.get('Range');
      const upstreamHeaders: Record<string, string> = range ? { Range: range } : {};
      let source: string;
      const expires = Math.min(now + 300, target.expires_at ? Math.floor(Date.parse(target.expires_at) / 1000) : now + 300);
      if (playback) {
        if (target.playback_id !== playback || !Number.isFinite(expires) || expires <= now) return fail(404);
        source = capsule?.url ?? await deps.mux(playback, url.searchParams.get('kind') ?? 'video', expires);
        muxUrl(source);
      } else {
        if (target.bucket !== 'post-images' || target.path !== path) return fail(404);
        const s = deps.storage(path!); source = s.url; Object.assign(upstreamHeaders, s.headers);
      }
      let upstream: Response | undefined;
      for (let redirects = 0; redirects < 4; redirects++) {
        upstream = await deps.fetch(source, { method: req.method, headers: upstreamHeaders, redirect: 'manual' });
        if (![301,302,303,307,308].includes(upstream.status)) break;
        if (!playback) return fail(502);
        const next = new URL(upstream.headers.get('Location') ?? '', source).href;
        muxUrl(next); source = next;
      }
      if (!upstream || ![200,206].includes(upstream.status)) return fail(upstream?.status === 404 ? 404 : 502);
      const out = new Headers(headers);
      for (const h of ['Content-Type','Content-Length','Content-Range','Accept-Ranges']) {
        const value = upstream.headers.get(h); if (value) out.set(h, value);
      }
      if (req.method === 'HEAD') return new Response(null, { status: upstream.status, headers: out });
      const isPlaylist = !!playback && (/\.m3u8(?:\?|$)/i.test(source) || /mpegurl/i.test(upstream.headers.get('Content-Type') ?? ''));
      if (isPlaylist) {
        const body = await rewriteManifest(await upstream.text(), source, async (resource) => {
          muxUrl(resource);
          const link = new URL(deps.endpoint); link.search = '';
          link.searchParams.set('resource', await deps.seal({ playback: playback!, url: resource, expires }));
          return link.href;
        });
        out.delete('Content-Length'); out.set('Content-Type','application/vnd.apple.mpegurl');
        return new Response(body, { headers: out });
      }
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch { return fail(502); } // Never log provider URLs, JWTs or private paths.
  };
}
const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export async function capsuleCodec(secret: string) {
  const raw = bytes(secret);
  if (raw.length !== 32) throw Error('A 32-byte proxy key is required');
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt']);
  return {
    async seal(value: Capsule): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value))));
      const payload = new Uint8Array(12 + encrypted.length);payload.set(iv);payload.set(encrypted,12);return base64(payload);
    },
    async open(value: string): Promise<Capsule> {
      if (value.length > 16384) throw Error('Invalid resource');
      const payload=bytes(value);
      return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name:'AES-GCM',iv:payload.slice(0,12) },key,payload.slice(12))));
    },
  };
}
export async function muxToken(playback: string, audience: 'v' | 't', expires: number, id: string, encodedPem: string): Promise<string> {
  // Mux PEM keys may be PKCS#1 or PKCS#8; normalize with the runtime's parser.
  const pem = atob(encodedPem);
  const der = pem.includes('BEGIN RSA PRIVATE KEY')
    ? createPrivateKey(pem).export({ format: 'der', type: 'pkcs8' })
    : bytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''));
  const key = await crypto.subtle.importKey('pkcs8',new Uint8Array(der),{ name:'RSASSA-PKCS1-v1_5',hash:'SHA-256' },false,['sign']);
  const encode = (v: unknown) => base64(new TextEncoder().encode(JSON.stringify(v)));
  const value = `${encode({alg:'RS256',typ:'JWT',kid:id})}.${encode({sub:playback,aud:audience,exp:expires})}`;
  return value+'.'+base64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(value))));
}
