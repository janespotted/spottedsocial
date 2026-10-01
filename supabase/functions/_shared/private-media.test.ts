import { linkHandler, muxSigner, muxToken, LINK_TTL_SECONDS, type LinkDependencies, type LinkResponse } from './private-media.ts'
import { secureMuxAsset, type Asset } from './secure-mux-asset.ts'
const assert=(v:unknown,message='Assertion failed')=>{if(!v)throw Error(message)}
const endpoint='https://project.invalid/functions/v1/private-media'
const request=(body:unknown,token='allowed')=>new Request(endpoint,{method:'POST',body:JSON.stringify(body),headers:token?{Authorization:`Bearer ${token}`}:{}})
const NOW=1000000
function harness() {
 const allowed=new Set(['owner/private-v1/photo.jpg','signed']);let signedPaths:string[]=[];const claims:Record<string,unknown>[]=[]
 const deps:LinkDependencies={now:()=>NOW*1000,
  async authorize(req,paths,playback){
   if(req.headers.get('Authorization')!=='Bearer allowed')return null
   return [...paths.filter(p=>allowed.has(p)).map(p=>({kind:'path' as const,media_key:p,expires_at:null})),
    ...playback.filter(p=>allowed.has(p)).map(p=>({kind:'playback' as const,media_key:p,expires_at:new Date((NOW+3600)*1000).toISOString()}))]
  },
  async signPaths(paths){signedPaths=paths;return new Map(paths.map(p=>[p,'https://storage.invalid/sign/'+p+'?token=t']))},
  async signMux(p,aud,exp,c){claims.push({...c,sub:p,aud,exp});return `${aud}-token`},
 }
 return {deps,handler:linkHandler(deps),signedPaths:()=>signedPaths,claims,revoke:()=>allowed.clear()}
}
Deno.test('missing JWT and invalid session receive no links',async()=>{
 const h=harness()
 assert((await h.handler(request({paths:['owner/private-v1/photo.jpg']},''))).status===401)
 assert((await h.handler(request({paths:['owner/private-v1/photo.jpg']},'outsider'))).status===401)
 assert(h.signedPaths().length===0)
})
Deno.test('only authorized items are signed; revoked viewers get nothing',async()=>{
 const h=harness()
 const res=await h.handler(request({paths:['owner/private-v1/photo.jpg','other/private-v1/x.jpg'],playback_ids:['signed','unknown']}))
 const body=await res.json() as LinkResponse
 assert(Object.keys(body.paths).join()==='owner/private-v1/photo.jpg');assert(h.signedPaths().join()==='owner/private-v1/photo.jpg')
 assert(body.paths['owner/private-v1/photo.jpg'].expires_at===NOW+LINK_TTL_SECONDS)
 assert(Object.keys(body.playback).join()==='signed')
 assert(res.headers.get('cache-control')?.includes('no-store'))
 h.revoke()
 const after=await (await h.handler(request({paths:['owner/private-v1/photo.jpg'],playback_ids:['signed']}))).json() as LinkResponse
 assert(Object.keys(after.paths).length===0&&Object.keys(after.playback).length===0)
})
Deno.test('Mux links point at the CDN, expire with the post, and carry thumbnail options as claims',async()=>{
 const h=harness();h.deps.authorize=async()=>[{kind:'playback',media_key:'signed',expires_at:new Date((NOW+60)*1000).toISOString()}]
 const body=await (await h.handler(request({playback_ids:['signed'],poster_width:480}))).json() as LinkResponse
 const link=body.playback.signed
 assert(link.stream==='https://stream.mux.com/signed.m3u8?token=v-token');assert(link.poster==='https://image.mux.com/signed/thumbnail.jpg?token=t-token')
 assert(link.expires_at===NOW+60)
 const thumb=h.claims.find(c=>c.aud==='t')!;assert(thumb.width===480&&thumb.height===600&&thumb.time===0.5&&thumb.exp===NOW+60)
})
Deno.test('expired parent gets no Mux link',async()=>{
 const h=harness();h.deps.authorize=async()=>[{kind:'playback',media_key:'signed',expires_at:new Date((NOW-1)*1000).toISOString()}]
 const body=await (await h.handler(request({playback_ids:['signed']}))).json() as LinkResponse
 assert(Object.keys(body.playback).length===0);assert(h.claims.length===0)
})
Deno.test('malformed and oversized requests are rejected before authorization',async()=>{
 const h=harness();let calls=0;const authorize=h.deps.authorize;h.deps.authorize=async(...a)=>{calls++;return authorize(...a)}
 assert((await h.handler(request({paths:'x'}))).status===400)
 assert((await h.handler(request({paths:Array.from({length:61},(_,i)=>'p'+i)}))).status===400)
 assert((await h.handler(request({playback_ids:['a'],poster_width:5000}))).status===400)
 assert((await h.handler(new Request(endpoint,{headers:{Authorization:'Bearer allowed'}}))).status===405)
 assert(calls===0)
})
Deno.test('authorization never echoes an item that was not requested',async()=>{
 const h=harness();h.deps.authorize=async()=>[{kind:'path',media_key:'someone/else.jpg',expires_at:null}]
 const body=await (await h.handler(request({paths:['owner/private-v1/photo.jpg']}))).json() as LinkResponse
 assert(Object.keys(body.paths).length===0)
})
Deno.test('Mux signer keeps reserved claims authoritative',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
 const der=new Uint8Array(await crypto.subtle.exportKey('pkcs8',keys.privateKey))
 const pem='-----BEGIN PRIVATE KEY-----\n'+btoa(String.fromCharCode(...der))+'\n-----END PRIVATE KEY-----'
 const sign=await muxSigner('key-id',btoa(pem));const jwt=await sign('asset','t',12345,{width:480,sub:'other',exp:99999999})
 const claims=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))))
 assert(claims.sub==='asset'&&claims.exp===12345&&claims.width===480)
})
Deno.test('Mux JWT uses verifiable RS256, exact asset, audience and expiry',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
 const der=new Uint8Array(await crypto.subtle.exportKey('pkcs8',keys.privateKey))
 const pem='-----BEGIN PRIVATE KEY-----\n'+btoa(String.fromCharCode(...der))+'\n-----END PRIVATE KEY-----'
 const jwt=await muxToken('asset','v',12345,'key-id',btoa(pem));const [head,body,sig]=jwt.split('.')
 const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))
 const claims=JSON.parse(new TextDecoder().decode(decode(body)));assert(claims.sub==='asset'&&claims.aud==='v'&&claims.exp===12345)
 assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',keys.publicKey,decode(sig),new TextEncoder().encode(head+'.'+body)))
})
Deno.test('existing public Mux asset is secured only after every public ID is revoked and rechecked',async()=>{
 const asset:Asset={id:'a',passthrough:'owner',playback_ids:[{id:'public-1',policy:'public'},{id:'public-2',policy:'public'}]};let deletes=0
 const api=async<T>(path:string,init?:RequestInit):Promise<T>=>{
  if(init?.method==='POST'){asset.playback_ids!.push({id:'signed',policy:'signed'});return {id:'signed'} as T}
  if(init?.method==='DELETE'){deletes++;asset.playback_ids=asset.playback_ids!.filter(p=>!path.endsWith(p.id));return undefined as T}
  return structuredClone(asset) as T
 }
 assert(await secureMuxAsset('a','owner',api)==='signed');assert(deletes===2)
 assert(await secureMuxAsset('a','owner',api)==='signed');assert(deletes===2)
 let denied=false;try{await secureMuxAsset('a','outsider',api)}catch{denied=true}assert(denied)
})
Deno.test('failed public Mux revocation never marks an asset secured',async()=>{
 const api=async<T>(_p:string,init?:RequestInit):Promise<T>=>{if(init?.method==='DELETE')throw Error('provider failure');return {id:'a',passthrough:'owner',playback_ids:[{id:'s',policy:'signed'},{id:'public',policy:'public'}]} as T}
 let denied=false;try{await secureMuxAsset('a','owner',api)}catch{denied=true}assert(denied)
})
Deno.test('physical media deletion failure stays queued; success acknowledges only after Storage deletion',async()=>{
 const {drainMediaObjects}=await import('./media-cleanup.ts');const calls:string[]=[]
 const rows=[{bucket_id:'post-images',name:'failed',attempts:0},{bucket_id:'post-images',name:'ok',attempts:0}]
 const result=await drainMediaObjects(rows,{
  remove:async row=>{calls.push('remove:'+row.name);return row.name==='failed'?'temporary error':null},
  acknowledge:async row=>{calls.push('ack:'+row.name);return true},
  retry:async row=>{calls.push('retry:'+row.name)},
 })
 assert(result.failed===1);assert(calls.join(',')==='remove:failed,retry:failed,remove:ok,ack:ok')
})

Deno.test('provider PKCS#1 PEM key is accepted as well as PKCS#8',async()=>{
 const {generateKeyPairSync}=await import('node:crypto')
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048})
 const pem=privateKey.export({format:'pem',type:'pkcs1'}).toString()
 assert((await muxToken('asset','t',12345,'key-id',btoa(pem))).split('.').length===3)
})
