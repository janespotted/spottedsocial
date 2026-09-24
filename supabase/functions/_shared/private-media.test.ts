import { capsuleCodec, mediaHandler, muxToken, type MediaDependencies } from './private-media.ts'
import { secureMuxAsset, type Asset } from './secure-mux-asset.ts'
const assert=(v:unknown,message='Assertion failed')=>{if(!v)throw Error(message)}
const key=btoa('01234567890123456789012345678901')
const endpoint='https://project.invalid/functions/v1/private-media'
const request=(query:string,token='allowed')=>new Request(endpoint+query,{headers:token?{Authorization:`Bearer ${token}`}:{}})
async function harness() {
 const codec=await capsuleCodec(key);let allowed=true,calls=0
 const deps:MediaDependencies={...codec,endpoint,now:()=>1000000,
  async authorize(req,path,playback){return allowed&&req.headers.get('Authorization')==='Bearer allowed'?playback?{playback_id:playback,expires_at:new Date(2000000).toISOString()}:{bucket:'post-images',path:path!}:null},
  storage:p=>({url:'https://storage.invalid/'+p,headers:{Authorization:'Bearer service-secret'}}),
  mux:async(p,k)=>`https://${k==='thumbnail'?'image':'stream'}.mux.com/${p}.${k==='thumbnail'?'jpg':'m3u8'}?token=provider-secret`,
  fetch:async()=>{calls++;return new Response('private bytes',{headers:{'Content-Type':'image/jpeg'}})},
 }
 return {deps,handler:mediaHandler(deps),calls:()=>calls,revoke:()=>{allowed=false}}
}
Deno.test('missing JWT, unrelated viewer and revoked viewer receive no private bytes',async()=>{
 const h=await harness()
 assert((await h.handler(request('?path=owner/photo.jpg',''))).status===401)
 assert((await h.handler(request('?path=owner/photo.jpg','outsider'))).status===404)
 assert(h.calls()===0)
 assert(await (await h.handler(request('?path=owner/photo.jpg'))).text()==='private bytes')
 h.revoke();assert((await h.handler(request('?path=owner/photo.jpg'))).status===404);assert(h.calls()===1)
})
Deno.test('authorized Storage response is streamed without shared caching or service credential disclosure',async()=>{
 const h=await harness();const res=await h.handler(request('?path=owner/photo.jpg'))
 assert(res.headers.get('cache-control')?.includes('no-store'));assert(res.headers.get('vary')==='Authorization')
 assert(![...res.headers.values()].join('').includes('service-secret'));assert(await res.text()==='private bytes')
})
Deno.test('HLS manifests encrypt every URI and require authorization again for copied segment URLs',async()=>{
 const h=await harness()
 h.deps.fetch=async()=>new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin?token=provider-secret"\n#EXT-X-MAP:URI="init.mp4"\nsegment.ts?token=provider-secret\n',{headers:{'Content-Type':'application/vnd.apple.mpegurl'}})
 const res=await h.handler(request('?playback_id=signed&kind=video'));assert(res.status===200)
 const body=await res.text();assert(!body.includes('provider-secret'));assert(!body.includes('stream.mux.com'))
 const urls=[...body.matchAll(/https:\/\/project.invalid[^"\s]+/g)].map(m=>m[0]);assert(urls.length===3)
 const copied=await h.handler(new Request(urls[2],{headers:{Authorization:'Bearer outsider'}}));assert(copied.status===404)
 h.revoke();assert((await h.handler(new Request(urls[2],{headers:{Authorization:'Bearer allowed'}}))).status===404)
})
Deno.test('tampered, expired and non-Mux capsules cannot fetch an upstream resource',async()=>{
 const h=await harness()
 for(const cap of ['invalid',await h.deps.seal({playback:'p',url:'https://stream.mux.com/a',expires:999}),await h.deps.seal({playback:'p',url:'https://127.0.0.1/private',expires:2000})]) {
  assert((await h.handler(request('?resource='+encodeURIComponent(cap)))).status>=400)
 }
 assert(h.calls()===0)
})
Deno.test('Mux redirect to a non-Mux host is denied without forwarding a token',async()=>{
 const h=await harness();let calls=0
 h.deps.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://attacker.invalid/'}})}
 assert((await h.handler(request('?playback_id=signed'))).status===502);assert(calls===1)
})
Deno.test('expired parent denies Mux playback even with valid identity',async()=>{
 const h=await harness();h.deps.authorize=async()=>({playback_id:'p',expires_at:new Date(500000).toISOString()})
 assert((await h.handler(request('?playback_id=p'))).status===404);assert(h.calls()===0)
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
