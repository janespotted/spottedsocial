// OPERATOR ONLY. Rotates old V1 object URLs. Not run by migrations or tests.
// Run during the reviewed media-write maintenance window; see rollout document.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
if(!Deno.args.includes('--apply'))throw Error('Review the rollout checklist, then explicitly pass --apply')
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const bucket=db.storage.from('post-images')
const keys:string[]=[]
async function inventory(prefix='') {
  for(let offset=0;;offset+=1000) {
    const {data,error}=await bucket.list(prefix,{limit:1000,offset,sortBy:{column:'name',order:'asc'}})
    if(error)throw error
    for(const item of data??[]) {
      const path=[prefix,item.name].filter(Boolean).join('/')
      if(item.id)keys.push(path)
      else await inventory(path)
    }
    if(!data || data.length<1000)break
  }
}
await inventory()
let rotated=0
for(const old of keys.filter(k=>!k.includes('/private-v1/'))) {
  const segments=old.split('/')
  const owner=segments[0]==='group-avatars'?segments.slice(0,2).join('/'):segments[0]
  // Unknown legacy layouts require manual attribution, never a guessed owner.
  if(!/^[0-9a-f-]{36}$/.test(segments[0]==='group-avatars'?segments[1]:segments[0]))throw Error('Unrecognized legacy owner path; manual review required')
  const ext=old.split('.').pop()?.replace(/[^a-zA-Z0-9]/g,'') || 'bin'
  const next=`${owner}/private-v1/${crypto.randomUUID()}.${ext}`
  const {error:copyError}=await bucket.copy(old,next)
  if(copyError)throw copyError
  const {error:rotateError}=await db.rpc('replace_private_media_path',{p_old:old,p_new:next})
  if(rotateError)throw rotateError
  const {error:deleteError}=await bucket.remove([old])
  if(deleteError)throw deleteError // Also remains durably queued for retry.
  rotated++
}
console.log(JSON.stringify({rotated}))
