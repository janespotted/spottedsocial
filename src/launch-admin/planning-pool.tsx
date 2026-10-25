import { useEffect, useRef, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { normalizePhone } from './types';
import { parsePlanningImport, type PlanningPerson } from './planning-import';
interface Prospect extends PlanningPerson { id: string; source: string; phone: string | null; shortlisted: boolean; guest_id: string | null; wave_name: string | null }
interface Pool { total: number; summary: { total: number; missingPhone: number; shortlisted: number; ready: number }; rows: Prospect[] }
export function PlanningPool({ preview, onQueue }: { preview: boolean; onQueue: () => void }) {
 const [pool,setPool]=useState<Pool|null>(null),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[offset,setOffset]=useState(0);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [source,setSource]=useState(''),[rows,setRows]=useState<PlanningPerson[]>([]),[detail,setDetail]=useState<Prospect|null>(null),[phone,setPhone]=useState('');
 const locked=useRef(false),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ if(detail&&!dialog.current?.open)dialog.current?.showModal(); },[detail?.id]);
 async function call(action:string,data:Record<string,unknown>={}) {
  if(preview)throw Error('Use the connected workspace to manage your planning pool.');
  const {data:result,error}=await (supabase as any).rpc('launch_pool',{p_action:action,p_data:data});
  if(error)throw Error(error.message);return result;
 }
 useEffect(()=>{
  let current=true;
  const timer=setTimeout(()=>{void call('list',{search,status,offset}).then(x=>{if(current)setPool(x)}).catch(e=>{if(current)setError(e.message)});},180);
  return()=>{current=false;clearTimeout(timer)};
 },[search,status,offset,revision]);
 async function run(work:()=>Promise<void>){if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('');try{await work();setRevision(x=>x+1)}catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.')}finally{locked.current=false;setBusy(false)}}
 return <div className="planning-pool">
  <section className="metrics">
   <div><span>Planning pool</span><strong>{pool?.summary.total??'—'}</strong><small>Choose your first 100 when ready</small></div>
   <div><span>Need a phone number</span><strong>{pool?.summary.missingPhone??'—'}</strong><small>Names stay saved while you collect them</small></div>
   <div><span>Shortlisted</span><strong>{pool?.summary.shortlisted??'—'}</strong><small>Your picks, without granting access</small></div>
   <div><span>Phone saved</span><strong>{pool?.summary.ready??'—'}</strong><small>Review before adding to the invite queue</small></div>
  </section>
  {error&&<div className="error" role="alert">{error}<button className="quiet" onClick={()=>{setError('');setRevision(x=>x+1)}}>Retry</button></div>}
  {notice&&<div className="notice" role="status">{notice}</div>}
  <section className="panel pool-import">
   <div><h2>Add a guest list</h2><p>Import names now. Add phone numbers later. Event RSVPs stay separate from Spotted invitations.</p></div>
   <label>Guest list CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async e=>{setError('');setRows([]);const f=e.target.files?.[0];if(!f)return;try{if(f.size>2_000_000)throw Error('Use a CSV smaller than 2 MB.');const parsed=parsePlanningImport(await f.text());setSource(f.name);setRows(parsed)}catch(err){setError(err instanceof Error?err.message:'Could not read the CSV.')}}}/></label>
   {rows.length>0&&<div className="selection"><span>{rows.length} people · {source} · no phone numbers required</span><button disabled={busy} onClick={()=>void run(async()=>{const result=await call('import',{source,rows});setNotice(`${result.added} people added to the planning pool. ${result.duplicates} already saved. No wave assigned or invitations sent.`);setRows([])})}>Import {rows.length} people</button></div>}
  </section>
  <section className="panel guest-panel">
   <div className="section-title"><div><h2>Your planning pool</h2><p>{pool?.total??'—'} people · shortlist now, collect numbers at your pace</p></div><button className="secondary" onClick={onQueue}>Open invitation queue ↗</button></div>
   <div className="filters"><input aria-label="Search planning pool" value={search} placeholder="Search names…" onChange={e=>{setSearch(e.target.value);setOffset(0)}}/><select aria-label="Filter planning pool" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}><option value="all">All people</option><option value="missing_phone">Needs phone number</option><option value="shortlisted">Shortlisted</option><option value="ready">Phone saved</option></select></div>
   <div className="table-scroll"><table><thead><tr><th>SHORTLIST</th><th>PERSON</th><th>EVENT RSVP</th><th>SPOTTED STATUS</th><th/></tr></thead><tbody>
    {pool?.rows.map(p=><tr key={p.id}><td><input type="checkbox" aria-label={`Shortlist ${p.name}`} checked={p.shortlisted} disabled={busy} onChange={e=>void run(async()=>{await call('update',{id:p.id,shortlisted:e.target.checked})})}/></td><td><button className="person" onClick={()=>{setDetail(p);setPhone(p.phone||'')}}><span className="avatar">{p.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><span><b>{p.name}</b><small>{p.phone||'Needs phone number'}</small></span></button></td><td>{p.event_status||'—'}<small>{p.rsvp_date}</small></td><td><span className="badge">{p.wave_name|| (p.guest_id?'In invitation queue':p.phone?'Phone saved':'Planning only')}</span></td><td><button className="quiet" aria-label={`Edit ${p.name}`} onClick={()=>{setDetail(p);setPhone(p.phone||'')}}>↗</button></td></tr>)}
   </tbody></table></div>
   {!pool&&!error&&<p className="empty">Loading your people…</p>}
   {pool&&!pool.rows.length&&<p className="empty">{search||status!=='all'?'No matches. Try another filter.':'Add a guest list to start your planning pool.'}</p>}
   <div className="pagination"><button className="secondary" disabled={offset===0||busy} onClick={()=>setOffset(x=>Math.max(0,x-100))}>Previous</button><span>{pool?.total?`${offset+1}–${Math.min(offset+100,pool.total)} of ${pool.total}`:'0 people'}</span><button className="secondary" disabled={!pool||offset+100>=pool.total||busy} onClick={()=>setOffset(x=>x+100)}>Next</button></div>
  </section>
  {detail&&<dialog ref={dialog} className="pool-dialog" aria-label="Planning contact details" onCancel={e=>{if(busy)e.preventDefault()}} onClose={()=>setDetail(null)}><section className="panel pool-detail"><div className="section-title"><div><p className="eyebrow">PLANNING CONTACT</p><h2>{detail.name}</h2></div><button className="quiet" disabled={busy} onClick={()=>dialog.current?.close()}>Close details</button></div><p>Event RSVP: {detail.event_status||'—'} · {detail.source}</p>{detail.invited_by&&<p>Invited to the event by {detail.invited_by}</p>}{detail.plus_one_of&&<p>Plus one of {detail.plus_one_of}</p>}<form onSubmit={e=>{e.preventDefault();void run(async()=>{const normalized=normalizePhone(phone);if(!normalized)throw Error('Enter a valid phone number; include the country code outside the US.');await call('update',{id:detail.id,phone:normalized});setDetail({...detail,phone:normalized});setPhone(normalized);setNotice('Phone saved. No access or invitation sent.')})}}><label>Phone number<input type="tel" autoComplete="off" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 212 555 0123" required disabled={busy||!!detail.guest_id}/></label><button disabled={busy||!!detail.guest_id}>Save phone</button></form><button className="secondary" disabled={busy||!detail.phone||!!detail.guest_id} onClick={()=>void run(async()=>{const r=await call('queue',{id:detail.id});setDetail({...detail,guest_id:r.guestId});setNotice('Added to the invitation queue. Open Next up to assign a draft wave. No invitation sent.')})}>{detail.guest_id?'In invitation queue':'Add to invitation queue'}</button></section></dialog>}
 </div>;
}
