import { createPrivateKey } from 'node:crypto';

/**
 * Private media link issuer. The phone sends the storage paths and Mux
 * playback ids it is about to render; the database decides which ones the
 * caller may see right now (private_media_targets), and only those come back
 * as short-lived links. The bytes then load straight from the Storage and Mux
 * CDNs, where the device caches them — nothing streams through this function.
 *
 * Revocation: an unfriend/block hides content immediately through RLS and the
 * realtime relationship broadcast; a link someone already holds stops working
 * when it expires (LINK_TTL_SECONDS, or the post's own expiry if sooner).
 */
export const LINK_TTL_SECONDS = 30 * 60;
export const MAX_ITEMS = 60;
const POSTER_ASPECT = 1.25;

export interface MediaTarget { kind: 'path' | 'playback'; media_key: string; expires_at: string | null }
export type MuxAudience = 'v' | 't';
export interface LinkDependencies {
  /** null = no valid session. Returns only the items the caller may see. */
  authorize(req: Request, paths: string[], playbackIds: string[]): Promise<MediaTarget[] | null>;
  /** Storage signed URLs keyed by path; missing entries are skipped. */
  signPaths(paths: string[], ttl: number): Promise<Map<string, string>>;
  signMux(playbackId: string, audience: MuxAudience, expires: number, claims?: Record<string, string | number>): Promise<string>;
  now?: () => number;
}
export interface LinkResponse {
  paths: Record<string, { url: string; expires_at: number }>;
  playback: Record<string, { stream: string; poster: string; expires_at: number }>;
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json',
};

function stringList(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.length === 0 || v.length > 512)) return null;
  return [...new Set(value as string[])];
}

export function linkHandler(deps: LinkDependencies) {
  return async (req: Request): Promise<Response> => {
    const reply = (status: number, body?: unknown) =>
      new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
    if (req.method === 'OPTIONS') return reply(204);
    if (req.method !== 'POST') return reply(405);
    if (!/^Bearer \S+$/i.test(req.headers.get('Authorization') ?? '')) return reply(401);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const paths = stringList(body?.paths);
    const playbackIds = stringList(body?.playback_ids);
    const posterWidth = body?.poster_width === undefined ? 1080 : Number(body.poster_width);
    if (!paths || !playbackIds || paths.length + playbackIds.length > MAX_ITEMS
      || !Number.isInteger(posterWidth) || posterWidth < 120 || posterWidth > 1080) return reply(400);

    const result: LinkResponse = { paths: {}, playback: {} };
    if (paths.length + playbackIds.length === 0) return reply(200, result);

    const targets = await deps.authorize(req, paths, playbackIds);
    if (!targets) return reply(401);
    const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);

    // Only echo back what was asked for AND authorized.
    const allowedPaths = targets
      .filter((t) => t.kind === 'path' && paths.includes(t.media_key))
      .map((t) => t.media_key);
    if (allowedPaths.length) {
      const signed = await deps.signPaths(allowedPaths, LINK_TTL_SECONDS);
      for (const path of allowedPaths) {
        const url = signed.get(path);
        if (url) result.paths[path] = { url, expires_at: now + LINK_TTL_SECONDS };
      }
    }

    const poster = { time: 0.5, width: posterWidth, height: Math.round(posterWidth * POSTER_ASPECT), fit_mode: 'smartcrop' };
    await Promise.all(targets
      .filter((t) => t.kind === 'playback' && playbackIds.includes(t.media_key))
      .map(async (t) => {
        const parent = t.expires_at ? Math.floor(Date.parse(t.expires_at) / 1000) : now + LINK_TTL_SECONDS;
        const expires = Math.min(now + LINK_TTL_SECONDS, parent);
        if (!Number.isFinite(expires) || expires <= now) return;
        const id = encodeURIComponent(t.media_key);
        // Signed playback: image options must be JWT claims, not query params.
        const [video, thumb] = await Promise.all([
          deps.signMux(t.media_key, 'v', expires),
          deps.signMux(t.media_key, 't', expires, poster),
        ]);
        result.playback[t.media_key] = {
          stream: `https://stream.mux.com/${id}.m3u8?token=${video}`,
          poster: `https://image.mux.com/${id}/thumbnail.jpg?token=${thumb}`,
          expires_at: expires,
        };
      }));
    return reply(200, result);
  };
}

const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Imports the Mux signing key once; the returned signer is reused per request. */
export async function muxSigner(id: string, encodedPem: string) {
  // Mux PEM keys may be PKCS#1 or PKCS#8; normalize with the runtime's parser.
  const pem = atob(encodedPem);
  const der = pem.includes('BEGIN RSA PRIVATE KEY')
    ? createPrivateKey(pem).export({ format: 'der', type: 'pkcs8' })
    : bytes(pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, ''));
  const key = await crypto.subtle.importKey('pkcs8', new Uint8Array(der), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const encode = (v: unknown) => base64(new TextEncoder().encode(JSON.stringify(v)));
  return async (playback: string, audience: MuxAudience, expires: number, claims: Record<string, string | number> = {}) => {
    const value = `${encode({ alg: 'RS256', typ: 'JWT', kid: id })}.${encode({ ...claims, sub: playback, aud: audience, exp: expires })}`;
    return value + '.' + base64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(value))));
  };
}

export async function muxToken(playback: string, audience: MuxAudience, expires: number, id: string, encodedPem: string): Promise<string> {
  return (await muxSigner(id, encodedPem))(playback, audience, expires);
}
