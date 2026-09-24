/** Reviewed migration primitive. Call only from an operator-run conversion script. */
export interface Asset { id: string; passthrough?: string; meta?: {creator_id?: string}; playback_ids?: {id:string;policy:string}[] }
export async function secureMuxAsset(assetId: string, owner: string, request: <T>(path:string,init?:RequestInit)=>Promise<T>): Promise<string> {
  const base=`/video/v1/assets/${encodeURIComponent(assetId)}`
  const asset=await request<Asset>(base)
  if(asset.id!==assetId || (asset.passthrough!==owner && asset.meta?.creator_id!==owner))throw Error('Asset ownership could not be verified')
  let signed=asset.playback_ids?.find(p=>p.policy==='signed')?.id
  if(!signed)signed=(await request<{id:string}>(`${base}/playback-ids`,{method:'POST',body:JSON.stringify({policy:'signed'})})).id
  if(!signed)throw Error('Signed playback unavailable')
  for(const old of asset.playback_ids??[])if(old.policy==='public') {
    await request(`${base}/playback-ids/${encodeURIComponent(old.id)}`,{method:'DELETE'})
  }
  // Confirm revocation before advertising a secured asset in our database.
  const verified=await request<Asset>(base)
  if(verified.playback_ids?.some(p=>p.policy==='public') || !verified.playback_ids?.some(p=>p.id===signed&&p.policy==='signed'))throw Error('Public playback revocation incomplete')
  return signed
}
