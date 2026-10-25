import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.112.4';
const url=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const dashboard='https://spottedsocial-git-codex-nyc-onboarding-waves-spottedsocial.vercel.app/launch-admin.html#monitoring';
const steps:Record<string,string>={
 push_backlog:'Check the push queue and worker. Notifications are overdue.',push_terminal:'Check provider failures before retrying the failed push queue.',
 push_disabled:'Queued notifications are waiting while delivery is switched off.',push_job:'Check whether the scheduled push worker is running.',
 client_errors:'Check client error counts and recent app changes.',api_errors:'Check API errors, Supabase logs and the affected feature.',
 reset_job:'Check the nightly reset scheduler and verify expiry behavior.',database_capacity:'Check database connection usage and the connection pool.',
};
Deno.serve(async req=>{
 if(!url||!service)return new Response('Not configured',{status:503});
 if(req.method!=='POST'||req.headers.get('authorization')!==`Bearer ${service}`)return new Response('Unauthorized',{status:401});
 const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('LAUNCH_ALERT_FROM');
 if(!key||!from)return Response.json({status:'not_configured'},{status:503});
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:jobs,error}=await db.rpc('claim_launch_alert_emails');
 if(error)return Response.json({status:'queue_unavailable'},{status:503});
 let accepted=0;
 for(const job of jobs??[]){
  let receipt:string|null=null;
  try {
   const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${key}`,'content-type':'application/json','idempotency-key':`spotted-launch-${job.id}`},
    body:JSON.stringify({from,to:[job.recipient],subject:'Spotted needs attention',text:`A critical launch incident needs review.\n\n${steps[job.key]??'Open the Command Center to inspect the incident.'}\n\n${dashboard}\n\nAcknowledging an incident does not resolve its cause. This alert contains no user identities, messages, or locations.`})});
   if(response.ok){const body=await response.json();if(typeof body.id==='string'&&body.id.length<=100)receipt=body.id;}
  } catch { /* Queue retains the incident; no secrets or provider body are logged. */ }
  const done=await db.rpc('finish_launch_alert_email',{p_id:job.id,p_lease:job.lease,p_provider_id:receipt});
  if(receipt&&!done.error)accepted++;
 }
 return Response.json({accepted,attempted:jobs?.length??0});
});
