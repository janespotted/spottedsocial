import {useEffect,useState} from 'react';
import {supabase} from '../integrations/supabase/client';
type Person={id:string;display_name:string|null;username:string|null;excluded:string|null;stage:string;errors_24h:number;last_activity:string|null;has_friends:boolean};
export function CommandPeople({preview=false}:{preview?:boolean}) {
 const [filter,setFilter]=useState('attention'),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const [data,setData]=useState<{rows:Person[];total:number}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();let cancelled=false;setData(null);setError('');
  if(preview){setData({total:0,rows:[]});return;}
  void(async()=>{try {const {data,error}=await(supabase as any).rpc('command_people',{p_filter:filter,p_offset:offset}).abortSignal(controller.signal);if(error)throw error;if(!cancelled)setData(data);}catch {if(!cancelled)setError('Account diagnostics could not load. Retry to get a current view.');}})();
  const timeout=setTimeout(()=>controller.abort(),10000);
  return()=>{cancelled=true;controller.abort();clearTimeout(timeout);};
 },[filter,offset,revision,preview]);
 async function toggle(p:Person){
  setBusy(true);setError('');
  try {const {error}=await(supabase as any).rpc('set_measurement_exclusion',{p_user:p.id,p_exclude:p.excluded!=='manual'});if(error)throw error;setRevision(n=>n+1);}catch {setError('Could not update measurement settings. Retry.');}finally {setBusy(false);}
 }
 return <section className="panel monitor-card"><h2>People who may need help</h2><p>Founder-only account diagnostics · no phone numbers, messages or locations</p>
  <label>Show <select value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0);}}><option value="attention">May need attention</option><option value="all">All accounts</option><option value="excluded">Excluded from analytics</option></select></label>
  {error&&<p role="alert" className="error">{error} <button onClick={()=>setRevision(n=>n+1)}>Retry</button></p>}
  {!data&&!error&&<p role="status">Loading account diagnostics…</p>}
  {data&&<><p>{data.total} accounts · captured when this view loaded</p><div className="table-scroll"><table><thead><tr><th>Account</th><th>Setup</th><th>Errors · 24h</th><th>Friends</th><th>Measurement</th></tr></thead><tbody>{data.rows.map(p=><tr key={p.id}><td>{p.display_name||p.username||'Unnamed account'}<small>{p.username?`@${p.username}`:''}</small></td><td>{p.stage.replace(/_/g,' ')}</td><td>{p.errors_24h}</td><td>{p.has_friends?'Connected':'No eligible friends'}</td><td>{p.excluded&&p.excluded!=='manual'?`Excluded · ${p.excluded}`:<button className="secondary" disabled={busy} onClick={()=>void toggle(p)}>{p.excluded==='manual'?'Include in analytics':'Exclude test account'}</button>}</td></tr>)}</tbody></table></div>
   {!data.rows.length&&<p>No matching accounts. This does not establish that every user journey is error-free.</p>}
   <div className="command-tabs"><button className="secondary" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Previous</button><button className="secondary" disabled={offset+25>=data.total} onClick={()=>setOffset(n=>n+25)}>Next</button><button className="secondary" onClick={()=>setRevision(n=>n+1)}>Refresh</button></div></>}
  <small>Exclusion changes analytics only; it does not disable an account. Demo accounts and night-mode testers stay excluded by their separate account flags. Three errors or unfinished setup are investigation signals, not proof that someone is confused.</small>
 </section>;
}
