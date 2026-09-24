import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { capsuleCodec, mediaHandler, muxToken } from '../_shared/private-media.ts'

const project = Deno.env.get('SUPABASE_URL')!
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Missing secrets fail closed. Never fall back to public playback.
Deno.serve(async req => {
  try {
    const codec = await capsuleCodec(Deno.env.get('PRIVATE_MEDIA_PROXY_KEY')!)
    return await mediaHandler({
      ...codec, fetch, endpoint: `${project}/functions/v1/private-media`,
      async authorize(request, path, playback) {
        const client = createClient(project,Deno.env.get('SUPABASE_ANON_KEY')!,{
          global:{headers:{Authorization:request.headers.get('Authorization')!}},auth:{persistSession:false},
        })
        const {data:{user},error:authError}=await client.auth.getUser()
        if(authError || !user)return null
        const {data,error}=await client.rpc('private_media_target',{p_path:path,p_playback_id:playback})
        return error ? null : data
      },
      storage(path) {
        return {url:`${project}/storage/v1/object/authenticated/post-images/${path.split('/').map(encodeURIComponent).join('/')}`,headers:{Authorization:`Bearer ${service}`,apikey:service}}
      },
      async mux(playback,kind,expires) {
        const thumbnail=kind==='thumbnail'
        const token=await muxToken(playback,thumbnail?'t':'v',expires,Deno.env.get('MUX_SIGNING_KEY_ID')!,Deno.env.get('MUX_SIGNING_PRIVATE_KEY')!)
        return thumbnail ? `https://image.mux.com/${encodeURIComponent(playback)}/thumbnail.jpg?token=${token}` : `https://stream.mux.com/${encodeURIComponent(playback)}.m3u8?token=${token}`
      },
    })(req)
  } catch { return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}}) }
})
