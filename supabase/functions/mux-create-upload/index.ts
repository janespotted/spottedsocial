import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createDirectUpload, muxConfigured } from '../_shared/mux.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/**
 * Mint a Mux direct-upload URL for the signed-in user (client feedback:
 * videos on Mux). The phone PUTs the file to the returned URL and inserts
 * the post with `mux_upload_id`; mux-webhook completes the row later.
 *
 * Mux credentials never reach the client — this is the only place an
 * upload can be created, and it is tied to a verified user id.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
  if (userError || !user) return json({ error: 'Unauthorized' }, 401)

  if (!muxConfigured() || !Deno.env.get('MUX_SIGNING_KEY_ID') || !Deno.env.get('MUX_SIGNING_PRIVATE_KEY') || !Deno.env.get('PRIVATE_MEDIA_PROXY_KEY')) {
    console.error('Secure Mux delivery is not configured')
    return json({ error: 'Video uploads are not available right now.' }, 503)
  }

  try {
    const upload = await createDirectUpload(user.id)
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { error: registryError } = await admin.from('mux_uploads').insert({ upload_id: upload.id, user_id: user.id })
    if (registryError) throw new Error('Upload ownership could not be recorded')
    return json({ uploadId: upload.id, url: upload.url, timeout: upload.timeout })
  } catch (e) {
    console.error('mux-create-upload failed:', e)
    return json({ error: "Couldn't start the video upload." }, 502)
  }
})
