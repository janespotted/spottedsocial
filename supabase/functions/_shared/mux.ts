/**
 * Minimal Mux Video REST helper for edge functions. Credentials come from
 * the MUX_TOKEN_ID / MUX_TOKEN_SECRET secrets (an access token with Mux
 * Video read+write). No SDK: the calls we make are three plain requests.
 */
const MUX_API = 'https://api.mux.com'

export function muxConfigured(): boolean {
  return !!Deno.env.get('MUX_TOKEN_ID') && !!Deno.env.get('MUX_TOKEN_SECRET')
}

function authHeader(): string {
  const id = Deno.env.get('MUX_TOKEN_ID')
  const secret = Deno.env.get('MUX_TOKEN_SECRET')
  if (!id || !secret) throw new Error('Mux is not configured (MUX_TOKEN_ID / MUX_TOKEN_SECRET)')
  return `Basic ${btoa(`${id}:${secret}`)}`
}

export async function muxRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MUX_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const messages = (body as { error?: { messages?: string[] } }).error?.messages
    throw new Error(`Mux ${init.method ?? 'GET'} ${path} → ${res.status}: ${messages?.join('; ') ?? res.statusText}`)
  }
  return (body as { data: T }).data
}

export interface MuxDirectUpload {
  id: string
  url: string
  status: string
  timeout: number
}

/**
 * Mint a direct-upload URL whose resulting asset requires signed playback, capped at
 * 1080p and encoded at the "basic" quality tier — a 14-second phone clip
 * viewed on a phone gains nothing from the higher tiers.
 */
export function createDirectUpload(userId: string): Promise<MuxDirectUpload> {
  return muxRequest<MuxDirectUpload>('/video/v1/uploads', {
    method: 'POST',
    body: JSON.stringify({
      cors_origin: '*',
      timeout: 3600,
      new_asset_settings: {
        playback_policies: ['signed'],
        video_quality: 'basic',
        max_resolution_tier: '1080p',
        normalize_audio: true,
        passthrough: userId,
        meta: { creator_id: userId },
      },
    }),
  })
}

/** Best-effort asset delete; a missing asset is treated as already gone. */
export async function deleteMuxAsset(assetId: string): Promise<boolean> {
  try {
    await muxRequest<void>(`/video/v1/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' })
    return true
  } catch (e) {
    if (/→ 404/.test((e as Error).message)) return true
    console.error(`Mux asset delete failed for ${assetId}:`, e)
    return false
  }
}

/** Delete many assets with bounded concurrency; returns how many are gone. */
export async function deleteMuxAssets(assetIds: string[], concurrency = 5): Promise<number> {
  let gone = 0
  const queue = [...new Set(assetIds.filter(Boolean))]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift()!
      if (await deleteMuxAsset(id)) gone++
    }
  })
  await Promise.all(workers)
  return gone
}
