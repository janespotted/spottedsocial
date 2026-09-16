import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Mux → posts. Receives asset lifecycle events and completes the video
 * post that the phone inserted with only `mux_upload_id`.
 *
 *   video.upload.asset_created → mux_asset_id
 *   video.asset.ready          → mux_playback_id, mux_status='ready', pixel size
 *   video.asset.errored /
 *   video.upload.errored /
 *   video.upload.cancelled     → mux_status='errored'
 *
 * Authenticity: every request is checked against the Mux-Signature header
 * (HMAC-SHA256 of `${timestamp}.${rawBody}` with MUX_WEBHOOK_SECRET) and a
 * 5-minute replay window. verify_jwt is off — Mux does not hold a Supabase
 * token. Always answer 2xx once the signature checks out: Mux retries
 * non-2xx responses, and a row we cannot find is not going to appear later.
 */

const TOLERANCE_SECONDS = 300

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifySignature(header: string | null, rawBody: string, secret: string): Promise<boolean> {
  if (!header) return false
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const idx = kv.indexOf('=')
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()]
    })
  )
  const timestamp = parts.t
  const signature = parts.v1
  if (!timestamp || !signature) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`)
  return timingSafeEqual(expected, signature)
}

interface MuxTrack {
  type: string
  max_width?: number
  max_height?: number
}

interface MuxEvent {
  type: string
  data: {
    id: string
    upload_id?: string
    asset_id?: string
    status?: string
    playback_ids?: { id: string; policy: string }[]
    tracks?: MuxTrack[]
    aspect_ratio?: string
    duration?: number
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('MUX_WEBHOOK_SECRET')
  if (!secret) {
    console.error('MUX_WEBHOOK_SECRET is not set')
    return new Response('Webhook not configured', { status: 500 })
  }

  const rawBody = await req.text()
  if (!(await verifySignature(req.headers.get('mux-signature'), rawBody, secret))) {
    return new Response('Invalid signature', { status: 401 })
  }

  let event: MuxEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { type, data } = event

  try {
    switch (type) {
      case 'video.upload.asset_created': {
        // data = the upload; data.asset_id is the new asset
        if (data.asset_id) {
          const { error } = await supabase
            .from('posts')
            .update({ mux_asset_id: data.asset_id })
            .eq('mux_upload_id', data.id)
          if (error) console.error('asset_created update failed:', error)
        }
        break
      }

      case 'video.asset.ready': {
        // data = the asset; carries upload_id when it came from a direct upload
        const playbackId = data.playback_ids?.find((p) => p.policy === 'public')?.id ?? data.playback_ids?.[0]?.id
        if (!playbackId) {
          console.error(`asset ${data.id} ready without a playback id`)
          break
        }
        const video = data.tracks?.find((t) => t.type === 'video')
        const patch = {
          mux_asset_id: data.id,
          mux_playback_id: playbackId,
          mux_status: 'ready',
          media_width: video?.max_width ?? null,
          media_height: video?.max_height ?? null,
        }
        let query = supabase.from('posts').update(patch)
        query = data.upload_id ? query.eq('mux_upload_id', data.upload_id) : query.eq('mux_asset_id', data.id)
        const { data: rows, error } = await query.select('id')
        if (error) console.error('asset.ready update failed:', error)
        else if (!rows?.length) console.warn(`asset.ready: no post for asset ${data.id} / upload ${data.upload_id}`)
        break
      }

      case 'video.asset.errored': {
        let query = supabase.from('posts').update({ mux_status: 'errored', mux_asset_id: data.id })
        query = data.upload_id ? query.eq('mux_upload_id', data.upload_id) : query.eq('mux_asset_id', data.id)
        const { error } = await query
        if (error) console.error('asset.errored update failed:', error)
        break
      }

      case 'video.upload.errored':
      case 'video.upload.cancelled': {
        const { error } = await supabase
          .from('posts')
          .update({ mux_status: 'errored' })
          .eq('mux_upload_id', data.id)
        if (error) console.error(`${type} update failed:`, error)
        break
      }

      default:
        // video.asset.created, static renditions, etc. — nothing to record
        break
    }
  } catch (e) {
    console.error(`mux-webhook ${type} handler threw:`, e)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
