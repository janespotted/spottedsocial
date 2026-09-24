// OPERATOR ONLY. This script changes Mux and database state. Not run by tests or migrations.
// First review docs/V1-PRIVACY-REMEDIATION.md. Requires explicit --apply.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2'
import {muxRequest} from '../supabase/functions/_shared/mux.ts'
import {secureMuxAsset} from '../supabase/functions/_shared/secure-mux-asset.ts'
if(!Deno.args.includes('--apply'))throw Error('Review the rollout checklist, then explicitly pass --apply')
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
let converted=0
while(true) {
  const {data,error}=await db.from('posts').select('id,user_id,mux_asset_id').eq('mux_signed',false).not('mux_asset_id','is',null).limit(50)
  if(error)throw error
  if(!data?.length)break
  for(const post of data) {
    const playback=await secureMuxAsset(post.mux_asset_id,post.user_id,muxRequest)
    const {error:updateError}=await db.from('posts').update({mux_signed:true,mux_playback_id:playback}).eq('id',post.id).eq('mux_asset_id',post.mux_asset_id)
    if(updateError)throw updateError
    converted++
  }
}
console.log(JSON.stringify({converted}))
