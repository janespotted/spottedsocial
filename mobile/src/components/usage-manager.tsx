import {useEffect,useRef} from 'react';
import {AppState} from 'react-native';
import {usePathname} from 'expo-router';
import {useSession} from '@/hooks/use-session';
import {useDemoMode} from '@/lib/demo-mode';
import {telemetry} from '@/lib/telemetry';
import {installMeasurementSink,routeSurface} from '@/lib/telemetry-core';
export function UsageManager() {
 const {session}=useSession();const demo=useDemoMode();const path=usePathname();const route=useRef(path);route.current=path;
 const enabled=!!session&&!demo&&!__DEV__;
 const recordRoute=()=>{
  const surface=routeSurface(route.current);telemetry.record({event:'screen_view',surface});
  if(route.current==='/venue')telemetry.record({event:'venue_selected',surface});
  if(route.current==='/friend-card'||route.current==='/search')telemetry.record({event:'friend_discovered',surface:'friends'});
  if(surface==='onboarding')telemetry.record({event:'onboarding_view',surface});
 };
 useEffect(()=>{
  let cancelled=false,ready=false;
  const change=(state:string)=>{
   if(!ready)return;
   if(state==='active'){telemetry.start();recordRoute();void telemetry.flush();}
   else {telemetry.end();void telemetry.flush();}
  };
  void telemetry.identify(enabled?session!.user.id:null).then(()=>{
   if(cancelled||!enabled)return;ready=true;installMeasurementSink(telemetry.captureSink());change(AppState.currentState);
  });
  const sub=AppState.addEventListener('change',change);
  const heartbeat=setInterval(()=>{if(ready&&AppState.currentState==='active')telemetry.heartbeat();},30000);
  const flush=setInterval(()=>{if(ready)void telemetry.flush();},10000);
  return()=>{cancelled=true;ready=false;installMeasurementSink(null);telemetry.end();sub.remove();clearInterval(heartbeat);clearInterval(flush);};
 },[session?.user.id,enabled]);
 useEffect(()=>{if(enabled&&AppState.currentState==='active')recordRoute();},[path,enabled]);
 return null;
}
