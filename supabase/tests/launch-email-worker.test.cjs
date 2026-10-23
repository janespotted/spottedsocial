const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../functions/launch-alert-email/index.ts'),'utf8');
const js=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
async function setup(config,providerOK=true){
 let handler;const calls=[],requests=[];const job={id:'incident-1',lease:'lease-1',key:'api_errors',recipient:'founder@example.test'};
 const Deno={env:{get:n=>config[n]},serve:h=>handler=h};
 const createClient=()=>({rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='claim_launch_alert_emails'?[job]:null,error:null};}});
 const send=async(url,init)=>{requests.push([url,init]);return new Response(JSON.stringify(providerOK?{id:'receipt'}:{error:'SECRET provider error'}),{status:providerOK?200:500});};
 new Function('require','exports','Deno','fetch',js)(()=>({createClient}),{},Deno,send);
 return {run:handler,calls,requests};
}
(async()=>{
 const base={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
 let t=await setup(base);assert.equal((await t.run(new Request('https://worker',{method:'POST'}))).status,401);assert.equal(t.calls.length,0);
 const req=()=>new Request('https://worker',{method:'POST',headers:{authorization:'Bearer test-service'}});
 assert.equal((await t.run(req())).status,503);assert.equal(t.requests.length,0,'no sender config cannot send');
 t=await setup({...base,RESEND_API_KEY:'test-key',LAUNCH_ALERT_FROM:'alerts@example.test'});const result=await (await t.run(req())).json();assert.equal(result.accepted,1);
 assert.equal(t.requests[0][1].headers['idempotency-key'],'spotted-launch-incident-1');
 assert.equal(t.calls.at(-1)[1].p_provider_id,'receipt');
 assert.ok(!t.requests[0][1].body.includes('test-service'));assert.ok(!t.requests[0][1].body.includes('test-key'));
 t=await setup({...base,RESEND_API_KEY:'test-key',LAUNCH_ALERT_FROM:'alerts@example.test'},false);await t.run(req());assert.equal(t.calls.at(-1)[1].p_provider_id,null,'provider failure returns to bounded retry queue');
 console.log('PASS: worker authentication, disabled sender, provider idempotency, acceptance receipt, failure retry and credential redaction.');
})().catch(e=>{console.error(e);process.exitCode=1;});
