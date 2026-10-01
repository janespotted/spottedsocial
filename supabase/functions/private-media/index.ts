import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { linkHandler, muxSigner, type MediaTarget } from '../_shared/private-media.ts'

const project = Deno.env.get('SUPABASE_URL')!
const anon = Deno.env.get('SUPABASE_ANON_KEY')!
const admin = createClient(project, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

// Imported lazily so photo links keep working even before the Mux signing
// secrets are set; video links then fail closed (never public playback).
let signer: ReturnType<typeof muxSigner> | null = null
const getSigner = () => (signer ??= muxSigner(Deno.env.get('MUX_SIGNING_KEY_ID')!, Deno.env.get('MUX_SIGNING_PRIVATE_KEY')!))

const handler = linkHandler({
  async authorize(request, paths, playbackIds) {
    const client = createClient(project, anon, {
      global: { headers: { Authorization: request.headers.get('Authorization')! } },
      auth: { persistSession: false },
    })
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) return null
    const { data, error } = await client.rpc('private_media_targets', { p_paths: paths, p_playback_ids: playbackIds })
    if (error) throw error
    return (data ?? []) as MediaTarget[]
  },
  async signPaths(paths, ttl) {
    const { data, error } = await admin.storage.from('post-images').createSignedUrls(paths, ttl)
    if (error) throw error
    const links = new Map<string, string>()
    for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) links.set(r.path, r.signedUrl)
    return links
  },
  async signMux(playback, audience, expires, claims) {
    return (await getSigner())(playback, audience, expires, claims)
  },
})

Deno.serve(async (req) => {
  try {
    return await handler(req)
  } catch {
    // Never log provider tokens, signed URLs or private paths.
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } })
  }
})
