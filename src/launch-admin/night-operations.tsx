import {lazy, Suspense, useEffect, useState} from 'react';
import {supabase} from '../integrations/supabase/client';
import {monitoringError} from './monitoring-types';
const VenueMap=lazy(()=>import('./venue-activity-map'));

export type VenueActivity={venue_id:string;name:string;neighborhood:string|null;lat:number;lng:number;people:number;members:{id:string;name:string}[]};
export interface NightSnapshot {
 generated_at:string; city:'nyc'|'la'; night_started_at:string; viewer_participates:boolean;
 counts:{eligible:number;out:number;tbd:number;in:number;paused:number;unknown:number;mapped:number};
 venues:VenueActivity[];
 presence:{online:number;last_heartbeat:string|null;reporting_24h:number};
 readiness:{install_link_saved:boolean;phone_gate_enabled:boolean;sms_enabled:boolean;push_enabled:boolean;push_accepted_24h:number;
  last_screen_event:string|null;last_api_event:string|null;email_enabled:boolean;email_last_worker:string|null;email_last_accepted:string|null;expired_statuses:number;
  reset_jobs:{name:string;enabled:boolean;last_run:string|null;status:string|null}[]};
}
export type Check={label:string;state:'ready'|'attention'|'unavailable';detail:string;link?:string};
const fresh=(at:string|null,age:number,now:number)=>!!at && Number.isFinite(Date.parse(at)) && now-Date.parse(at)<age && now-Date.parse(at)>=-60_000;
export function launchChecks(s:NightSnapshot,now=Date.now()):Check[] {
 const r=s.readiness;
 const expectedResetJobs=['nightly-reset-et-dst','nightly-reset-et','nightly-reset-pt-dst','nightly-reset-pt'];
 const resetOK=expectedResetJobs.every(name=>r.reset_jobs.some(j=>j.name===name&&j.enabled&&j.status==='succeeded'&&fresh(j.last_run,26*3600_000,now))) && r.expired_statuses===0;
 return [
  {label:'Download destination',state:r.install_link_saved?'ready':'attention',detail:r.install_link_saved?'A destination is saved. Open it on an iPhone to verify access.':'Save the App Store or TestFlight destination before sending invitations.',link:'#settings'},
  {label:'Phone-based invitation gate',state:r.phone_gate_enabled?'ready':'attention',detail:r.phone_gate_enabled?'The database requires phone-based wave admission. Verify one invited and one uninvited account before launch.':'Admission is currently open. Enable the approved invitation gate when the release is ready.',link:'#settings'},
  {label:'iPhone tracking',state:fresh(r.last_screen_event,86400_000,now)&&fresh(r.last_api_event,86400_000,now)&&s.presence.reporting_24h>0?'ready':'attention',detail:'Requires recent foreground heartbeats, screen views and API measurements. Older builds undercount; this is not proof of every installed build.'},
  {label:'Push notifications',state:r.push_enabled&&r.push_accepted_24h>0?'ready':'attention',detail:r.push_enabled?`${r.push_accepted_24h} provider-accepted sends in 24 hours, system-wide including tests. Device receipt still needs an end-to-end check.`:'Delivery is disabled. Verify the sender and a real-device test before enabling it.'},
  {label:'Critical email alerts',state:r.email_enabled&&!!r.email_last_accepted&&fresh(r.email_last_worker,300_000,now)?'ready':'attention',detail:r.email_enabled?'Confirm a received test email and a worker check within five minutes.':'Sender not connected. Dashboard alerts work independently; automatic emails are not enabled.'},
  {label:'5 AM reset',state:resetOK?'ready':'attention',detail:`${r.reset_jobs.length} known reset jobs. ${r.expired_statuses} expired OUT/TBD rows awaiting cleanup. Counts and the map exclude expired rows immediately; job success alone does not verify all deletion flows.`},
  {label:'Native crash reporting',state:'unavailable',detail:'Not connected. Caught screen errors do not detect native process crashes or forced quits.'},
  {label:'Independent outage alerts',state:'unavailable',detail:'An external monitor is not connected. The database cannot reliably notify you about its own complete outage.'},
  {label:'App version / build coverage',state:'unavailable',detail:'Installed build numbers are not yet reported. Confirm the release candidate and telemetry with the coordinated iPhone release.'},
  {label:'Bulk invitation sender',state:r.sms_enabled?'ready':'attention',detail:r.sms_enabled?'SMS is configured; recipient consent and wave review are still required before sending.':'Automated SMS is not enabled. Personal sending remains a separate action; selecting a person never sends a message.',link:'#waves'},
 ];
}

export function NightOperations({preview=false,view,onSettings,onWaves}:{preview?:boolean;view:'Tonight'|'Launch readiness';onSettings:()=>void;onWaves:()=>void}) {
 const [city,setCity]=useState<'nyc'|'la'>('nyc'),[data,setData]=useState<NightSnapshot|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(true);
 const [selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{
  let cancelled=false,inFlight=false; let active:AbortController|undefined;
  setData(null);setSelected(null);setError('');
  async function load(){
   if(inFlight)return;inFlight=true;setBusy(true);
   const controller=new AbortController();active=controller;
   const timeout=setTimeout(()=>controller.abort(),10_000);
   try {
    let result:NightSnapshot;
    if(preview&&import.meta.env.DEV){const {nightPreview}=await import('./night-preview');result=nightPreview(city);}
    else {const r=await (supabase as any).rpc('command_launch_night',{p_city:city}).abortSignal(controller.signal);if(r.error)throw r.error;result=r.data;}
    if(!result||result.city!==city||!Array.isArray(result.venues))throw Error('Invalid snapshot');
    if(!cancelled){setData(result);setError('');setSelected(previous=>result.venues.some(v=>v.venue_id===previous)?previous:null);}
   }catch(e){if(!cancelled){setData(null);setSelected(null);setError(monitoringError(e as {code?:string}));}}
   finally{clearTimeout(timeout);inFlight=false;if(!cancelled)setBusy(false);}
  }
  const refresh=()=>{if(document.visibilityState==='visible')void load();};
  void load();const timer=setInterval(refresh,15_000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
  return()=>{cancelled=true;active?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);};
 },[city,preview,revision]);
 const chosen=data?.venues.find(v=>v.venue_id===selected);
 const checks=data?launchChecks(data):[];
 return <section className="night-operations" aria-label={view==='Tonight'?'Tonight’s status and venues':'Launch readiness'}>
  <div className="section-title"><div><span className="eyebrow">{view==='Tonight'?'THE CITY, TONIGHT':'BEFORE THE FIRST INVITE'}</span><h2>{view==='Tonight'?'Who’s making a night of it?':'Launch readiness'}</h2></div>
   <div className="night-controls"><label>City <select value={city} onChange={e=>setCity(e.target.value as 'nyc'|'la')}><option value="nyc">New York</option><option value="la">Los Angeles</option></select></label><button className="secondary" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Refresh snapshot</button></div>
  </div>
  {error&&<p className="error" role="alert">{error} <button onClick={()=>setRevision(n=>n+1)}>Retry</button></p>}
  {!data&&!error&&<p role="status">Loading tonight’s snapshot…</p>}
  {data&&<>
   <p className="monitor-note">{preview?'Synthetic preview · ':''}Snapshot {new Date(data.generated_at).toLocaleTimeString()} · refreshes every 15 seconds while visible · {data.counts.eligible} completed, eligible members in {city==='nyc'?'NYC':'LA'}</p>
   {view==='Tonight'?<>
    <div className="night-stats">{([
     ['OUT',data.counts.out,'Sharing an Out status','out'],['TBD',data.counts.tbd,'Still deciding','tbd'],['IN',data.counts.in,'Explicitly staying in','in'],['Sharing paused',data.counts.paused,'Not assumed to be home','paused'],['No answer',data.counts.unknown,'No current nightly status','unknown']
    ] as const).map(([name,value,note,key])=><div key={key} className={`night-stat night-stat-${key}`}><span>{name}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
    <p className="monitor-note">Status is self-reported and expires at the city’s 5 AM reset. It does not mean the app is open. Demo and tester accounts are excluded.</p>
    <div className="venue-operations panel">
     <div className="section-title"><div><h3>Where the night is happening</h3><p>{data.counts.mapped} people sharing a public venue with you · {data.venues.length} spots</p></div><span className="status">Permission-aware</span></div>
     {!data.viewer_participates&&<p className="notice">Your account is not currently OUT or TBD. The app’s participation rule also applies here; identities and venues remain hidden.</p>}
     <p className="monitor-note">Only venues and names your account may already see in the app appear. Private parties, private addresses and personal GPS positions never appear. Other OUT statuses remain in the total above.</p>
     {data.venues.length?<div className="venue-activity-layout"><Suspense fallback={<p role="status">Loading venue map…</p>}><VenueMap venues={data.venues} selected={selected} onSelect={setSelected} city={city}/></Suspense>
      <div className="venue-activity-list" aria-label="Active venues">{data.venues.map(v=><button key={v.venue_id} className={`venue-activity-row ${v.venue_id===selected?'selected':''}`} aria-pressed={v.venue_id===selected} onClick={()=>setSelected(v.venue_id===selected?null:v.venue_id)}><span><strong>{v.name}</strong><small>{v.neighborhood||'Public venue'}</small></span><span className="venue-activity-count">{v.people}<small>sharing</small></span></button>)}</div>
     </div>:<div className="venue-map-empty"><strong>No shared venues to show yet.</strong><p>Locations appear here when eligible people share a public venue with your account.</p></div>}
     {chosen&&<div className="venue-members"><div className="section-title"><h3>{chosen.name}</h3><button className="secondary" onClick={()=>setSelected(null)}>Close venue</button></div><p>Sharing this spot · {chosen.people}</p><ul>{chosen.members.map(m=><li key={m.id}>{m.name}</li>)}</ul></div>}
    </div>
    <p className="monitor-note">App presence: {data.presence.last_heartbeat?`${data.presence.online} foreground users with a heartbeat in the last 90 seconds`:'not yet receiving heartbeats'}. {data.presence.reporting_24h} members reported a heartbeat in 24 hours. Older app builds are not represented.</p>
   </>:<>
    <p className="notice">{checks.filter(c=>c.state!=='ready').length} checks need attention or an external connection. “Evidence present” confirms the observation shown; it is not a launch approval.</p>
    <div className="readiness-list">{checks.map(c=><article className="panel readiness-check" key={c.label}><div><h3>{c.label}</h3><p>{c.detail}</p>{c.link&&<button className="secondary" onClick={c.link==='#waves'?onWaves:onSettings}>Open {c.link==='#waves'?'waves':'launch settings'} →</button>}</div><span className={`status readiness-${c.state}`}>{c.state==='ready'?'Evidence present':c.state==='attention'?'Needs attention':'Not connected'}</span></article>)}</div>
   </>}
  </>}
 </section>;
}
