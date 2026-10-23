import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';
export type HealthKind = 'heartbeat' | 'render_error' | 'unhandled_error' | 'unhandled_rejection';
let windowStarted=0, attempts=0;
// Only a fixed event kind and platform leave this process. Never accept an Error,
// URL, stack trace, coordinates, user-entered text or arbitrary metadata here.
export async function reportClientHealth(kind:HealthKind):Promise<void> {
  if(import.meta.env.DEV) return;
  if(Date.now()-windowStarted>60_000) { windowStarted=Date.now(); attempts=0; }
  if(attempts>=10) return;
  attempts++;
  try {
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) return;
    const platform=Capacitor.getPlatform();
    await (supabase as any).rpc('record_client_health',{
      p_id:crypto.randomUUID(),p_kind:kind,p_platform:['ios','android'].includes(platform)?platform:'web',
    }).abortSignal(AbortSignal.timeout(5000));
  } catch { /* Monitoring never replaces the original error or disrupts the app. */ }
}
export function startClientHealth():()=>void {
  const heartbeat=()=>{if(document.visibilityState==='visible') void reportClientHealth('heartbeat');};
  const error=()=>void reportClientHealth('unhandled_error');
  const rejection=()=>void reportClientHealth('unhandled_rejection');
  window.addEventListener('error',error); window.addEventListener('unhandledrejection',rejection);
  document.addEventListener('visibilitychange',heartbeat);
  const timer=setInterval(heartbeat,5*60_000);
  const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{queueMicrotask(heartbeat);});
  heartbeat();
  return ()=>{clearInterval(timer);subscription.unsubscribe();window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejection);document.removeEventListener('visibilitychange',heartbeat);};
}
