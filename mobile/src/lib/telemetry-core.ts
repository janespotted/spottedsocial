export type Surface = 'home'|'map'|'hot_spots'|'plans'|'activity'|'messages'|'friends'|'profile'|'venue'|'onboarding'|'other';
export type Measurement = {id:string;event:'screen_view'|'venue_selected'|'friend_discovered'|'onboarding_view'|'api_request';at:string;session:string;surface:Surface;duration_ms?:number;outcome?:'ok'|'rejected'|'server_error'|'network_error'};
export type Input = Pick<Measurement,'event'|'surface'> & Partial<Pick<Measurement,'duration_ms'|'outcome'>>;
let sink:((event:Input)=>void)|null=null;
export const installMeasurementSink=(next:typeof sink)=>{sink=next;};
export function routeSurface(path:string):Surface {
 const clean=path.split('?')[0].split('/').filter(p=>p&&!p.startsWith('('));
 const last=clean.at(-1)??'';
 if(clean.includes('onboarding')||['nominations','contacts-sync'].includes(last))return 'onboarding';
 if(last==='map')return 'map';
 if(last==='leaderboard'||last==='explore')return 'hot_spots';
 if(last==='venue'||last==='check-in')return 'venue';
 if(['friends','search','friend-card','invite-friends','contacts'].includes(last))return 'friends';
 if(['messages','thread','new-chat','new-group','group-members'].includes(last))return 'messages';
 if(['create-plan','edit-plan','plan-detail','plans'].includes(last))return 'plans';
 if(last==='activity')return 'activity';
 if(last==='profile'||last==='settings')return 'profile';
 if(last===''||last==='index')return 'home';
 return 'other';
}
export function networkSurface(path:string):Surface|null {
 if(/\/(record_usage|record_notification_open|record_command_events|touch_app_session|record_client_health)$/.test(path))return null;
 if(/checkin|night_status|venue|location/.test(path))return 'venue';
 if(/friend|contact/.test(path))return 'friends';
 if(/dm_|thread|group/.test(path))return 'messages';
 if(/plan/.test(path))return 'plans';
 if(/launch|nomina|profile|auth/.test(path))return 'onboarding';
 if(/notification|push/.test(path))return 'activity';
 if(/post/.test(path))return 'home';
 return 'other';
}
export function timedFetch(transport:typeof fetch):typeof fetch {
 return async(input,init)=>{
  const report=sink,start=Date.now();let surface:Surface|null=null;
  try {surface=networkSurface(new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url).pathname);} catch {}
  const finish=(outcome:Measurement['outcome'])=>{try {if(report&&surface)report({event:'api_request',surface,outcome,duration_ms:Math.min(120000,Math.max(0,Date.now()-start))});} catch {}};
  try {const response=await transport(input,init);finish(response.status>=500?'server_error':response.status>=400?'rejected':'ok');return response;}
  catch(error){if(!(error instanceof Error&&error.name==='AbortError'))finish('network_error');throw error;}
 };
}
export interface CollectorDependencies {
 now:()=>number;uuid:()=>string;
 read:(key:string)=>Promise<string|null>;write:(key:string,value:string)=>Promise<void>;remove:(key:string)=>Promise<void>;
 send:(events:Measurement[])=>Promise<void>;touch:(id:string,foreground:boolean)=>Promise<void>;
}
export function createCollector(d:CollectorDependencies) {
 let owner:string|null=null,revision=0,session:string|null=null,queue:Measurement[]=[],busy=false;
 let persistence=Promise.resolve();
 const key=(u:string)=>`spotted.measurement.v1.${u}`;
 const persist=()=>{const u=owner,r=revision,value=JSON.stringify(queue);if(!u)return;
  persistence=persistence.catch(()=>{}).then(async()=>{if(r===revision&&u===owner)await d.write(key(u),value);}).catch(()=>{});};
 const prune=()=>{queue=queue.filter(e=>Number.isFinite(Date.parse(e.at))&&d.now()-Date.parse(e.at)<86400000).slice(-300);};
 const record=(event:Input)=>{
  if(!owner||!session)return;
  prune();queue.push({...event,id:d.uuid(),at:new Date(d.now()).toISOString(),session});queue=queue.slice(-300);persist();
 };
 return {
  async identify(user:string|null) {
   if(owner===user)return;
   const prior=owner,r=++revision;owner=user;session=null;queue=[];busy=false;
   if(prior)persistence=persistence.catch(()=>{}).then(()=>d.remove(key(prior))).catch(()=>{});
   if(!user)return;
   try {const saved=await d.read(key(user));if(r!==revision)return;
    const data=saved?JSON.parse(saved):[];
    if(Array.isArray(data))queue=data.filter(e=>e&&typeof e.id==='string'&&typeof e.at==='string'&&typeof e.session==='string'&&typeof e.event==='string').slice(-300);
    prune();
   } catch {}
  },
  start() {if(!owner||session)return;session=d.uuid();void d.touch(session,true).catch(()=>{});},
  end() {const ended=session;session=null;if(ended)void d.touch(ended,false).catch(()=>{});},
  heartbeat() {if(owner&&session)void d.touch(session,true).catch(()=>{});},
  captureSink() {const r=revision;return(event:Input)=>{if(r===revision)record(event);};},
  record,
  async flush() {
   if(busy||!owner)return;prune();if(!queue.length)return;
   const r=revision,batch=queue.slice(0,40),ids=new Set(batch.map(e=>e.id));busy=true;
   try {await d.send(batch);if(r===revision){queue=queue.filter(e=>!ids.has(e.id));persist();}}
   catch {} // Stable IDs permit retry after a lost response without counting twice.
   finally {if(r===revision)busy=false;}
  },
  pending:()=>queue.length,
 };
}
