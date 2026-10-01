import { drainMediaObjects } from '../_shared/media-cleanup.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async req => {
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if(req.method!=='POST' || req.headers.get('Authorization')!==`Bearer ${key}`)return new Response(null,{status:403})
  const client=createClient(Deno.env.get('SUPABASE_URL')!,key)
  const {data:rows,error}=await client.rpc('pending_private_media_cleanup')
  if(error)return new Response('Cleanup queue unavailable',{status:500})
  const summary=await drainMediaObjects(rows ?? [],{
    async remove(row) {
      const {error}=await client.storage.from(row.bucket_id).remove([row.name])
      return error?.message ?? null
    },
    async acknowledge(row) {
      const {error}=await client.from('media_object_deletions').delete().eq('bucket_id',row.bucket_id).eq('name',row.name)
      return !error
    },
    async retry(row,error) {
      await client.from('media_object_deletions').update({attempts:row.attempts+1,last_error:error}).eq('bucket_id',row.bucket_id).eq('name',row.name)
    },
  })
  return Response.json(summary,{status:summary.failed?503:200})
})
