import {Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase';
import {isDemoMode,appFetch} from './demo-mode';
import {getSessionRevision,getSessionUserId,getSessionAccessToken,onSessionIdentityChange} from './session-identity';
import {createCollector,installMeasurementSink} from './telemetry-core';
async function call(name:string,args:object) {
 if(isDemoMode()||!getSessionUserId())throw Error('Measurement disabled');
 const captured=getSessionRevision(),token=getSessionAccessToken();
 if(!token)throw Error('Measurement disabled');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try {
  // Capture the credential with the owner; a late auth refresh cannot attribute an old batch to a new account.
  const response=await appFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',signal:controller.signal,
   headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},body:JSON.stringify(args)});
  if(captured!==getSessionRevision())throw Error('Account changed');
  if(!response.ok)throw Error('Measurement unavailable');
 } finally {clearTimeout(timer);}
}
export const telemetry=createCollector({now:Date.now,uuid:Crypto.randomUUID,
 read:key=>AsyncStorage.getItem(key),write:(key,value)=>AsyncStorage.setItem(key,value),remove:key=>AsyncStorage.removeItem(key),
 send:events=>call('record_command_events',{p_events:events}),touch:(id,active)=>call('touch_app_session',{p_session:id,p_foreground:active}),
});
onSessionIdentityChange(()=>{installMeasurementSink(null);void telemetry.identify(null);});

export async function reportRenderError() {
 if(__DEV__||isDemoMode()||!getSessionUserId())return;
 try {await call('record_client_health',{p_id:Crypto.randomUUID(),p_kind:'render_error',p_platform:Platform.OS==='android'?'android':Platform.OS==='web'?'web':'ios'});} catch {}
}
