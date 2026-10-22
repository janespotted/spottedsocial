import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createHandler } from './handler.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createHandler({secret:Deno.env.get('NETLIFY_INVITE_WEBHOOK_SECRET'),save:async (request:unknown)=>{
 const {error}=await admin.rpc('ingest_invite_request',{p_request:request,p_backfill:false});
 if(error)throw Error('Storage failed');
}}));
