const FORM_ID = '6aa44b3bf24f7a00081682c2';
const enc = new TextEncoder();
const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
export async function verifySignature(token, body, secret) {
 try {
  if (!secret || secret.length < 32 || !token || token.length > 8192) return false;
  const parts = token.split('.'); if(parts.length!==3) return false;
  const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='HS256'||header.crit||claims.iss!=='netlify') return false;
  const key = await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('HMAC',key,decode(parts[2]),enc.encode(parts[0]+'.'+parts[1]))) return false;
  if(claims.exp!==undefined && (!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000))return false;
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(x=>x.toString(16).padStart(2,'0')).join('');
  return claims.sha256===hash;
 } catch { return false; }
}
export function parseSubmission(payload) {
 // Netlify HTTP form notifications send the submission object directly.
 const p = payload?.payload ?? payload;
 if(!p || p.form_id!==FORM_ID || !/^[a-f0-9]{24}$/.test(p.id||'') || p.spam===true) throw Error('Invalid submission');
 const d = p.data;
 if(!d || typeof d!=='object' || Array.isArray(d) || d['company-website']) throw Error('Invalid fields');
 const field=(name,max,required=false)=>{
  const value=d[name]??'';
  if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Invalid fields');
  return value.trim();
 };
 const result={id:p.id,form_id:FORM_ID,first_name:field('first-name',80,true),last_name:field('last-name',80,true),email:field('email',254,true),phone:field('phone',32),neighborhood:field('neighborhood',160),referred_by:field('referred-by',120),submitted_at:p.created_at};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)||!result.submitted_at||!Number.isFinite(Date.parse(result.submitted_at))||Date.parse(result.submitted_at)>Date.now()+86400000)throw Error('Invalid fields');
 return result;
}
export function createHandler({secret,save}) {
 return async req=>{
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if(req.method!=='POST')return reply(405,{error:'POST required'});
  if(!secret||secret.length<32)return reply(503,{error:'Connection not configured'});
  if(Number(req.headers.get('content-length'))>32768)return reply(413,{error:'Request too large'});
  let body;
  try {
   const reader=req.body?.getReader();const chunks=[];let size=0;
   if(!reader)return reply(400,{error:'Request body required'});
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){void reader.cancel().catch(()=>{});return reply(413,{error:'Request too large'});}chunks.push(value);}
   body=new Uint8Array(size);let offset=0;for(const part of chunks){body.set(part,offset);offset+=part.length;}
  }catch{return reply(400,{error:'Could not read request'});}
  if(!await verifySignature(req.headers.get('x-webhook-signature'),body,secret))return reply(401,{error:'Invalid signature'});
  let submission;
  try{submission=parseSubmission(JSON.parse(new TextDecoder().decode(body)));}catch{return reply(400,{error:'Invalid submission'});}
  try{await save(submission);return reply(200,{accepted:true});}catch{return reply(503,{error:'Could not save. Retry delivery.'});}
 };
}
