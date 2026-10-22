import {useEffect,useRef,useState} from 'react';
import {supabase} from '../integrations/supabase/client';
import './requested-invites.css';
export interface InviteRequest {id:string;first_name:string;last_name:string;email:string;phone:string;neighborhood:string;referred_by:string;submitted_at:string;reviewed_at:string|null}
interface Page {total:number;summary:{total:number;new:number;withPhone:number};connection:{enabledAt:string|null;lastDeliveryAt:string|null;backfilledAt:string|null};rows:InviteRequest[]}
const date=(v:string|null)=>v?new Date(v).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
const fixture:Page={total:2,summary:{total:2,new:2,withPhone:1},connection:{enabledAt:new Date().toISOString(),lastDeliveryAt:new Date().toISOString(),backfilledAt:new Date().toISOString()},rows:[
 {id:'000000000000000000000001',first_name:'Alex',last_name:'Sample',email:'alex@example.com',phone:'(212) 555-0101',neighborhood:'West Village / Greenwich Village',referred_by:'A friend',submitted_at:new Date().toISOString(),reviewed_at:null},
 {id:'000000000000000000000002',first_name:'Jordan',last_name:'Demo',email:'jordan@example.com',phone:'',neighborhood:'A little everywhere',referred_by:'Instagram',submitted_at:new Date().toISOString(),reviewed_at:null}
]};
export function RequestedInvites({preview}:{preview:boolean}) {
 const [page,setPage]=useState<Page|null>(null),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[offset,setOffset]=useState(0);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[detail,setDetail]=useState<InviteRequest|null>(null),[updated,setUpdated]=useState<string|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),request=useRef(0),alive=useRef(true),previewRows=useRef(fixture.rows);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;}},[]);
 useEffect(()=>{if(detail&&!dialog.current?.open)dialog.current?.showModal();},[detail?.id]);
 async function call(action:string,data:Record<string,unknown>={}) {
  if(preview){
   if(action==='review'){previewRows.current=previewRows.current.map(r=>r.id===data.id?{...r,reviewed_at:data.reviewed?new Date().toISOString():null}:r);return {ok:true};}
   const rows=previewRows.current.filter(r=>(status==='all'||(status==='new'?!r.reviewed_at:!!r.reviewed_at))&&Object.values(r).join(' ').toLowerCase().includes(search.toLowerCase()));
   return {...fixture,summary:{...fixture.summary,new:previewRows.current.filter(r=>!r.reviewed_at).length},rows,total:rows.length};
  }
  const {data:result,error}=await (supabase as any).rpc('requested_invites',{p_action:action,p_data:data});
  if(error)throw Error(error.message);return result;
 }
 useEffect(()=>{
  let current=true, firstLoad=true;let timer:ReturnType<typeof setTimeout>;
  const load=async()=>{
   if(!firstLoad&&document.visibilityState==='hidden'){timer=setTimeout(load,15000);return;}
   firstLoad=false;const id=++request.current;
   try{const result=await call('list',{search,status,offset});if(current&&id===request.current){setPage(result);setError('');setUpdated(new Date().toISOString());setLoading(false);}}
   catch(e){if(current&&id===request.current){setPage(null);setDetail(null);setError(e instanceof Error?e.message:'Could not load requests. Try again.');setLoading(false);}}
   if(current)timer=setTimeout(load,15000);
  };
  setLoading(true);setPage(null);timer=setTimeout(load,180);
  return()=>{current=false;request.current++;clearTimeout(timer);};
 },[search,status,offset,revision]);
 async function mark(r:InviteRequest,reviewed:boolean){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');
  try{await call('review',{id:r.id,reviewed});if(alive.current){setDetail(null);setNotice(reviewed?'Marked as reviewed. No invitation sent.':'Moved back to new requests.');setRevision(x=>x+1);}}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not save. Try again.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <div className="requested-invites">
  <section className="metrics" aria-label="Website request totals">
   <div><span>Requests received</span><strong>{page?.summary.total??'—'}</strong><small>From joinspottedapp.com</small></div>
   <div><span>New to review</span><strong>{page?.summary.new??'—'}</strong><small>Your next circle starts here</small></div>
   <div><span>Phone provided</span><strong>{page?.summary.withPhone??'—'}</strong><small>Optional on the website form</small></div>
  </section>
  {error&&<div className="error" role="alert">{error}<button className="quiet" onClick={()=>setRevision(x=>x+1)}>Retry</button></div>}
  {notice&&<div className="notice" role="status">{notice}</div>}
  <section className="panel guest-panel">
   <div className="section-title"><div><h2>Requested invites</h2><p>Review interest before choosing a wave.</p></div><button className="secondary" disabled={loading} onClick={()=>setRevision(x=>x+1)}>Refresh</button></div>
   <div className="request-connection"><span className="badge">{!page?'Checking connection':page.connection.enabledAt?'Netlify connected':'Connection pending'}</span><span>{page?.connection.enabledAt?'New submissions arrive automatically. This view refreshes every 15 seconds.':'Existing requests are saved here. Automatic delivery is being connected.'}</span><small>Updated {date(updated)}{page?.connection.lastDeliveryAt?` · Last delivery ${date(page.connection.lastDeliveryAt)}`:''}</small></div>
   <div className="filters"><input aria-label="Search requested invites" placeholder="Search names, email, phone…" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/><select aria-label="Filter requested invites" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="all">All requests</option><option value="new">New to review</option><option value="reviewed">Reviewed</option></select></div>
   <div className="table-scroll"><table><thead><tr><th>PERSON</th><th>NEIGHBORHOOD</th><th>REFERRED BY</th><th>RECEIVED</th><th>STATUS</th></tr></thead><tbody>{page?.rows.map(r=><tr key={r.id}><td><button className="person" onClick={()=>setDetail(r)} aria-label={`View request from ${r.first_name} ${r.last_name}`}><span className="avatar">{r.first_name[0]}{r.last_name[0]}</span><span><b>{r.first_name} {r.last_name}</b><small>{r.email}</small><small>{r.phone||'No phone provided'}</small></span></button></td><td>{r.neighborhood||'—'}</td><td>{r.referred_by||'—'}</td><td><time dateTime={r.submitted_at}>{date(r.submitted_at)}</time></td><td><span className={'badge '+(r.reviewed_at?'':'open')}>{r.reviewed_at?'Reviewed':'New'}</span></td></tr>)}</tbody></table></div>
   {loading&&<p className="empty" role="status">Loading requests…</p>}
   {page&&!page.rows.length&&<p className="empty">{search||status!=='all'?'No matching requests. Try another search or filter.':'Invite requests will appear here when someone submits the website form.'}</p>}
   <div className="pagination"><button className="secondary" disabled={offset===0||loading} onClick={()=>setOffset(x=>Math.max(0,x-50))}>Previous</button><span>{page?.total?`${offset+1}–${Math.min(offset+50,page.total)} of ${page.total}`:'0 requests'}</span><button className="secondary" disabled={!page||offset+50>=page.total||loading} onClick={()=>setOffset(x=>x+50)}>Next</button></div>
  </section>
  {detail&&<dialog ref={dialog} className="pool-dialog" aria-label="Invite request details" onCancel={e=>{if(busy)e.preventDefault();}} onClose={()=>setDetail(null)}><section className="panel pool-detail"><div className="section-title"><div><p className="eyebrow">WEBSITE REQUEST</p><h2>{detail.first_name} {detail.last_name}</h2></div><button className="quiet" disabled={busy} onClick={()=>dialog.current?.close()}>Close details</button></div><dl className="request-details"><dt>Email</dt><dd>{detail.email}</dd><dt>Phone</dt><dd>{detail.phone||'Not provided'}</dd><dt>Usually goes out in</dt><dd>{detail.neighborhood||'Not provided'}</dd><dt>Referred by</dt><dd>{detail.referred_by||'Not provided'}</dd><dt>Requested</dt><dd>{date(detail.submitted_at)}</dd><dt>Status</dt><dd>{detail.reviewed_at?'Reviewed':'New to review'}</dd></dl><p>Requests do not grant access or send invitations. Choose your guests through the existing wave controls.</p>{error&&<p role="alert" className="error">{error}</p>}<button disabled={busy} onClick={()=>void mark(detail,!detail.reviewed_at)}>{busy?'Saving…':detail.reviewed_at?'Mark as new':'Mark as reviewed'}</button></section></dialog>}
 </div>;
}
