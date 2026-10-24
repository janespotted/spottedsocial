import {useEffect,useState} from 'react';
import {supabase} from '../integrations/supabase/client';
import {monitoringError} from './monitoring-types';
export type RosterPerson={id:string;name:string|null;wave:string;invited_at:string|null;claimed_at:string|null;completed_at:string|null;excluded:boolean;first_checkin:string|null;errors_24h:number;last_activity:string|null;friends:number;attention:string};
export const rosterGuidance:Record<string,{label:string;action:string}>={
 excluded:{label:'Test account excluded',action:'Check the account’s tester flag before interpreting its activity.'},
 repeated_errors:{label:'Repeated errors',action:'Open App health and review the affected feature before contacting this person.'},
 not_invited:{label:'Ready for invitation review',action:'Review the wave and download link. Nothing has been sent to this person.'},
 not_joined:{label:'Hasn’t joined yet',action:'Check the invitation link and phone number before sending a reminder. Delivery is not confirmed.'},
 setup_incomplete:{label:'Setup unfinished',action:'Check profile and two-person nomination steps. Incomplete setup alone does not prove a broken flow.'},
 no_friends:{label:'No friends yet',action:'Help them connect with people they know. Don’t create friendships without their action.'},
 no_checkin_recorded:{label:'No check-in recorded',action:'A check-in has not been recorded since tracking began. They may not have gone out yet.'},
 activated:{label:'First check-in recorded',action:'Look for another active night and returning social interactions.'},
};
export function filterRoster(rows:RosterPerson[],wave:string,filter:string,search:string) {
 const query=search.trim().toLocaleLowerCase();
 return rows.filter(p=>(!wave||p.wave===wave)&&(filter==='all'||p.attention===filter)&&(!query||(p.name||'').toLocaleLowerCase().includes(query)));
}
export function LaunchRoster({preview=false,onWaves}:{preview?:boolean;onWaves:()=>void}) {
 const [data,setData]=useState<{rows:RosterPerson[];total:number;generated_at:string}|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const [wave,setWave]=useState(''),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{
  let cancelled=false,loading=false;let request:AbortController|undefined;
  async function load(){if(loading)return;loading=true;const controller=new AbortController();request=controller;const timeout=setTimeout(()=>controller.abort(),10000);
   try{
    let result;
    if(preview&&import.meta.env.DEV){result={generated_at:new Date().toISOString(),total:3,rows:['not_invited','setup_incomplete','repeated_errors'].map((attention,i)=>({id:String(i),name:['Alex · demo','Sam · demo','Riley · demo'][i],wave:'First wave · preview',invited_at:i?new Date().toISOString():null,claimed_at:i?new Date().toISOString():null,completed_at:null,excluded:false,first_checkin:null,errors_24h:i===2?3:0,last_activity:null,friends:0,attention}))};}
    else {const r=await (supabase as any).rpc('command_launch_roster').abortSignal(controller.signal);if(r.error)throw r.error;result=r.data;}
    if(!result||!Array.isArray(result.rows))throw Error('Invalid roster');if(!cancelled){setData(result);setError('');setSelected(id=>result.rows.some((p:RosterPerson)=>p.id===id)?id:null);}
   }catch(e){if(!cancelled){setData(null);setSelected(null);setError(monitoringError(e as {code?:string}));}}finally{clearTimeout(timeout);loading=false;}
  }
  const refresh=()=>{if(document.visibilityState==='visible')void load();};void load();const timer=setInterval(refresh,15_000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
  return()=>{cancelled=true;request?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('online',refresh);};
 },[preview,revision]);
 const rows=filterRoster(data?.rows??[],wave,filter,search),person=rows.find(p=>p.id===selected);
 const guidance=person?rosterGuidance[person.attention]:null;
 return <section className="panel monitor-card launch-roster"><div className="section-title"><div><span className="eyebrow">FROM INVITED TO INVOLVED</span><h2>Launch roster</h2></div><button className="secondary" onClick={()=>setRevision(n=>n+1)}>Refresh roster</button></div>
  <p>Selected people, their signup milestones, and where a helping hand may be useful. No messages are sent from this view.</p>
  <div className="roster-filters"><label>Find a person<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name"/></label><label>Wave<select value={wave} onChange={e=>setWave(e.target.value)}><option value="">All waves</option>{[...new Set(data?.rows.map(p=>p.wave)??[])].map(w=><option key={w}>{w}</option>)}</select></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Everyone selected</option>{Object.entries(rosterGuidance).map(([key,g])=><option value={key} key={key}>{g.label}</option>)}</select></label></div>
  {error&&<p role="alert" className="error">{error} <button onClick={()=>setRevision(n=>n+1)}>Retry</button></p>}
  {!data&&!error&&<p role="status">Loading selected people…</p>}
  {data&&<><p className="monitor-note">{rows.length} shown · {data.total} selected · snapshot {new Date(data.generated_at).toLocaleTimeString()} · refreshes every 15 seconds{data.total>data.rows.length?' · first 500 loaded':''}</p>
   <div className="table-scroll"><table><thead><tr><th>Person</th><th>Invited</th><th>Joined</th><th>Onboarded</th><th>Friends</th><th>First check-in</th><th>Next step</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><strong>{p.name||'Unnamed person'}</strong><small>{p.wave}</small></td><td>{p.invited_at?'Marked sent':'Not sent'}</td><td>{p.claimed_at?'Joined':'Not yet'}</td><td>{p.completed_at?'Complete':'Not yet'}</td><td>{p.excluded?'Excluded':p.friends}</td><td>{p.excluded?'Excluded':p.first_checkin?'Recorded':'Not recorded'}</td><td><button className="secondary" aria-expanded={p.id===selected} onClick={()=>setSelected(p.id===selected?null:p.id)}>{rosterGuidance[p.attention]?.label||'Review'}</button></td></tr>)}</tbody></table></div>
   {!rows.length&&<p>No people match these filters.</p>}
   {person&&guidance&&<div className="roster-detail"><div className="section-title"><h3>{person.name||'Selected person'}</h3><button className="secondary" onClick={()=>setSelected(null)}>Close details</button></div><p>{guidance.action}</p><p>{person.errors_24h} recorded errors in 24 hours · last recorded activity: {person.last_activity?new Date(person.last_activity).toLocaleString():'none'}</p><button className="secondary" onClick={onWaves}>Review waves →</button></div>}
   <small>Invitation marked sent is not confirmed receipt. Milestones use recorded server actions; historical gaps and older app builds can undercount. A missing action is a signal to investigate, not proof of a failure.</small>
  </>}
 </section>;
}
