import type {NightSnapshot} from './night-operations';
export function nightPreview(city:'nyc'|'la'):NightSnapshot {
 const now=new Date().toISOString();
 return {generated_at:now,city,night_started_at:now,viewer_participates:true,
  counts:city==='nyc'?{eligible:100,out:42,tbd:19,in:18,paused:3,unknown:18,mapped:11}:{eligible:0,out:0,tbd:0,in:0,paused:0,unknown:0,mapped:0},
  venues:city==='nyc'?[
   {venue_id:'demo-venue-1',name:'Preview venue · SoHo',neighborhood:'SoHo',lat:40.7249,lng:-73.9997,people:5,members:['Alex','Sam','Taylor','Morgan','Jordan'].map((name,i)=>({id:`a${i}`,name:`${name} · demo`}))},
   {venue_id:'demo-venue-2',name:'Preview venue · LES',neighborhood:'Lower East Side',lat:40.7204,lng:-73.9898,people:4,members:['Robin','Casey','Charlie','Avery'].map((name,i)=>({id:`b${i}`,name:`${name} · demo`}))},
   {venue_id:'demo-venue-3',name:'Preview venue · Brooklyn',neighborhood:'Williamsburg',lat:40.7136,lng:-73.9656,people:2,members:['Riley','Jamie'].map((name,i)=>({id:`c${i}`,name:`${name} · demo`}))}
  ]:[],presence:city==='nyc'?{online:24,last_heartbeat:now,reporting_24h:61}:{online:0,last_heartbeat:null,reporting_24h:0},
  readiness:{install_link_saved:false,phone_gate_enabled:true,sms_enabled:false,push_enabled:true,push_accepted_24h:24,last_screen_event:now,last_api_event:now,email_enabled:false,email_last_worker:null,email_last_accepted:null,expired_statuses:0,reset_jobs:['nightly-reset-et-dst','nightly-reset-et','nightly-reset-pt-dst','nightly-reset-pt'].map(name=>({name,enabled:true,last_run:now,status:'succeeded'}))}};
}
