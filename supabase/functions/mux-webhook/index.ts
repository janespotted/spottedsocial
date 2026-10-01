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
 * token. Provider state is persisted before updating the optional post. Database
 * failures return 5xx for retry, including an upload whose registry is not ready.
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
    passthrough?: string
    meta?: { creator_id?: string }
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
    let lookup = supabase.from('mux_uploads').select('upload_id,user_id')
    lookup = type.startsWith('video.upload.') ? lookup.eq('upload_id',data.id)
      : data.upload_id ? lookup.eq('upload_id',data.upload_id) : lookup.eq('asset_id',data.id)
    if (!['video.upload.asset_created','video.asset.ready','video.asset.errored','video.upload.errored','video.upload.cancelled'].includes(type)) {
      return Response.json({received:true})
    }
    const {data:upload,error:lookupError}=await lookup.maybeSingle()
    if(lookupError)throw lookupError
    if(!upload) {
      const owner=data.passthrough ?? data.meta?.creator_id
      const asset=type.startsWith('video.asset.') ? data.id : data.asset_id
      if(owner && asset) {
        const {data:profile,error:profileError}=await supabase.from('profiles').select('id').eq('id',owner).maybeSingle()
        if(profileError)throw profileError
        if(!profile) {
          const {error:queueError}=await supabase.from('mux_asset_deletions').upsert({asset_id:asset},{onConflict:'asset_id',ignoreDuplicates:true})
          if(queueError)throw queueError
          return Response.json({received:true})
        }
      }
      return new Response('Upload registry not ready',{status:503})
    }
    let registry: Record<string,unknown> = {}, patch: Record<string,unknown> = {}
    if(type==='video.upload.asset_created' && data.asset_id) {
      registry={asset_id:data.asset_id};patch={mux_asset_id:data.asset_id}
    } else if(type==='video.asset.ready') {
      const playbackId=data.playback_ids?.find(p=>p.policy==='signed')?.id
      // Never accept public playback or an arbitrary fallback ID.
      if(!playbackId)return new Response('Signed playback not ready',{status:503})
      const video=data.tracks?.find(t=>t.type==='video')
      registry={asset_id:data.id,playback_id:playbackId,status:'ready',width:video?.max_width??null,height:video?.max_height??null}
      patch={mux_asset_id:data.id,mux_playback_id:playbackId,mux_signed:true,mux_status:'ready',media_width:video?.max_width??null,media_height:video?.max_height??null}
    } else if(type.endsWith('.errored') || type.endsWith('.cancelled')) {
      registry={status:'errored'};patch={mux_status:'errored'}
    }
    if(Object.keys(registry).length) {
      const {error}=await supabase.from('mux_uploads').update(registry).eq('upload_id',upload.upload_id)
      if(error)throw error
      const {error:postError}=await supabase.from('posts').update(patch).eq('mux_upload_id',upload.upload_id).eq('user_id',upload.user_id)
      if(postError)throw postError
    }
  } catch {
    return new Response('Media update pending retry',{status:503})
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
