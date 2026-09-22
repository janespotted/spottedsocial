const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const {webcrypto}=require('node:crypto');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',N='33333333-3333-4333-8333-333333333333';
const payload={notification_id:N,sender_id:A,receiver_id:B,type:'dm',message:'forged client body',lease_id:N};
function harness(opts={}) {
 let handler;const writes=[];const fetches=[];
 const env={SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'secret',APNS_AUTH_KEY:opts.key,APNS_KEY_ID:'TESTKEY123',APNS_TEAM_ID:'TESTTEAM',APNS_BUNDLE_ID:'com.spotted.app'};
 const row={id:N,sender_id:A,receiver_id:B,type:'dm',message:'stored message',data:{thread_id:A}};
 const db={auth:{getUser:async()=>({data:{user:{id:A}}})},rpc:async()=>({data:opts.allowed!==false}),from:table=>{
   let update;const filters=[];const q={select:()=>q,eq:(...v)=>{filters.push(v);return q;},gt:()=>q,update:v=>{update=v;return q;},
   maybeSingle:async()=>({data:table==='notifications'?(opts.mismatch?{...row,receiver_id:A}:row):opts.lease===false?null:{notification_id:N}}),
   single:async()=>({data:table==='profiles'?{push_enabled:true,apns_device_token:'a'.repeat(64),display_name:'Alice'}:null}),
   then:(resolve,reject)=>Promise.resolve({data:null,error:null}).then(v=>{writes.push({table,update,filters});return resolve(v)},reject)};return q;
 }};
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../supabase/functions/send-push/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const api={};
 new Function('require','exports','Deno','fetch','console','crypto',code+'\nexports.sendApnsPush=sendApnsPush;')(()=>({createClient:()=>db}),api,{env:{get:k=>env[k]},serve:fn=>handler=fn},async(url,init)=>{fetches.push({url,init});return new Response(opts.reason?JSON.stringify({reason:opts.reason}):'',{status:opts.status??200});},{log(){},error(){}},webcrypto);
 return {api,writes,fetches,request:async(worker=false,body=payload)=>handler(new Request('https://mock.invalid',{method:'POST',headers:{Authorization:`Bearer ${worker?'secret':'user-jwt'}`},body:JSON.stringify(body)}))};
}
let key;
async function signingKey(){if(!key){const keys=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);key=Buffer.from(await webcrypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')}return key}
test('ordinary app requests only acknowledge queue, never send directly',async()=>{const h=harness();const res=await h.request();assert.equal(res.status,200);assert.equal((await res.json()).queued,true);assert.equal(h.fetches.length,0)});
test('forged notification recipient is rejected',async()=>{const h=harness({mismatch:true});assert.equal((await h.request()).status,403);assert.equal(h.fetches.length,0)});
test('worker without a valid lease cannot send',async()=>{const h=harness({lease:false});assert.equal((await h.request(true)).status,409);assert.equal(h.fetches.length,0)});
test('privacy revoked after enqueue prevents provider call',async()=>{const h=harness({allowed:false});assert.equal((await (await h.request(true)).json()).reason,'privacy_or_expiry');assert.equal(h.fetches.length,0)});
test('worker sends stored content and thread metadata, not caller content',async()=>{const h=harness({key:await signingKey()});assert.equal((await (await h.request(true)).json()).success,true);const p=JSON.parse(h.fetches[0].init.body);assert.equal(p.aps.alert.body,'stored message');assert.equal(p.data.thread_id,A)});
test('provider 429 and 500 are retryable and never clear device tokens',async()=>{for(const status of [429,500]){const h=harness({key:await signingKey(),status,reason:status===429?'TooManyRequests':'InternalServerError'});assert.equal((await (await h.request(true)).json()).success,false);assert.equal(h.writes.filter(w=>w.update?.apns_device_token===null).length,0)}});
test('dead token cleanup compares the attempted token to preserve rotations',async()=>{const h=harness({key:await signingKey(),status:410,reason:'Unregistered'});await h.request(true);const write=h.writes.find(w=>w.update?.apns_device_token===null);assert.deepEqual(write.filters,[['id',B],['apns_device_token','a'.repeat(64)]])});
