import { CommandCenterPanels } from './command-center';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { actionLabels, alertLabels, percentage, runnerHealth, jobHealth, monitoringError, nightCoverage, type MonitorReport } from './monitoring-types';
const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'No events recorded';
function Metric({label,value,note}: {label: string; value: number | string; note: string}) {
  return <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}
export function Monitoring({preview,onSettings,onWaves}: {preview: boolean;onSettings:()=>void;onWaves:()=>void}) {
  const [stream,setStream] = useState('Connecting live updates'), [desktop,setDesktop] = useState(false), [alertBusy,setAlertBusy] = useState<string|null>(null), [alertError,setAlertError] = useState('');
  const notified=useRef(new Set<string>());
  const [days,setDays] = useState(7), [revision,setRevision] = useState(0);
  const [report,setReport] = useState<MonitorReport | null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setReport(current => current?.days === days ? current : null); setError(''); setBusy(true);
    async function load() {
      try {
        if (preview && import.meta.env.DEV) {
          const { monitoringPreview } = await import('./monitoring-preview');
          if (!cancelled) setReport(monitoringPreview(days));
        } else {
          const {data,error: failure} = await (supabase as any).rpc('command_center',{p_days: days}).abortSignal(controller.signal);
          if (failure) throw failure;
          if (!data || data.days !== days || !Array.isArray(data.nightly)) throw Error('Invalid monitoring response');
          if (!cancelled) setReport(data);
        }
      } catch (e) { if (!cancelled) { setReport(null); setError(monitoringError(e as {code?: string})); } }
      finally { if (!cancelled) setBusy(false); }
    }
    void load();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    return () => { cancelled=true; controller.abort(); clearTimeout(timeout); };
  },[days,revision,preview]);
  // Signals contain no metrics. Every refreshed report rechecks founder access.
  useEffect(() => {
    if (preview) { setStream('Design preview'); return; }
    let lastRefresh=0;
    const refresh=()=>{ if(document.visibilityState==='visible' && Date.now()-lastRefresh>4000) { lastRefresh=Date.now(); setRevision(n=>n+1); } };
    const timer=setInterval(refresh,15_000);
    const channel=supabase.channel('launch-hq-signal').on('postgres_changes',
      {event:'UPDATE',schema:'public',table:'launch_monitor_signal'},refresh)
      .subscribe(status=>setStream(status==='SUBSCRIBED'?'Live updates connected':'Live connection unavailable · 15-second refresh active'));
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('online',refresh);
    return ()=>{ clearInterval(timer); document.removeEventListener('visibilitychange',refresh); window.removeEventListener('online',refresh); void supabase.removeChannel(channel); };
  },[preview]);
  useEffect(()=>{
    if (!desktop || !report || preview || !('Notification' in window) || Notification.permission!=='granted') return;
    const fresh=(report.alerts ?? []).filter(a=>!a.resolved_at && !a.acknowledged_at && !notified.current.has(a.id));
    if(!fresh.length) return;
    fresh.forEach(a=>notified.current.add(a.id));
    // One generic notification per refresh, with no private information on a lock screen.
    try { new Notification('Spotted Launch HQ needs attention',{body:'Open Monitoring to review new launch alerts.',tag:'spotted-launch-alerts'}); } catch { setDesktop(false); }
  },[report,desktop,preview]);
  async function enableDesktop() {
    if(desktop) { setDesktop(false); return; }
    if(!('Notification' in window)) { setAlertError('Desktop alerts are not supported in this browser. Alerts remain available here.'); return; }
    try { const permission=await Notification.requestPermission(); setDesktop(permission==='granted'); if(permission!=='granted') setAlertError('Desktop alerts were not enabled. Alerts remain available here.'); }
    catch { setAlertError('Desktop alerts could not be enabled in this browser.'); }
  }
  async function acknowledge(id:string) {
    setAlertBusy(id); setAlertError('');
    try {
      if(preview) setReport(r=>r ? {...r,alerts:r.alerts?.map(a=>a.id===id?{...a,acknowledged_at:new Date().toISOString()}:a)} : r);
      else { const {error}=await (supabase as any).rpc('acknowledge_launch_alert',{p_id:id}); if(error) throw error; setRevision(n=>n+1); }
    } catch { setAlertError('Could not acknowledge this alert. Refresh and retry.'); }
    finally { setAlertBusy(null); }
  }
  return <div className="monitoring" aria-busy={busy}>
    <div className="monitor-toolbar">
      <label>Reporting period<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></select></label>
      <button className="secondary" disabled={busy} onClick={()=>setRevision(n=>n+1)}>{busy ? 'Refreshing…' : 'Refresh now'}</button>
      <small role="status">{report ? `Snapshot ${stamp(report.generated_at)} · ${stream} · refreshes within 15 seconds while visible` : busy ? 'Loading aggregate metrics…' : 'Current snapshot unavailable'}</small>
    </div>
    {error && <div role="alert" className="error">{error}</div>}
    {report && <>
      <div className="monitor-note">Founder access · aggregate metrics, with account diagnostics in People. Product activity excludes demo accounts, night-mode testers and excluded accounts. Nightly windows run from 5am to 5am in each profile city. Current nights are partial.</div>
      {!report.coverage.last_event_at && <div className="notice">No eligible usage events have arrived yet. Zeros below mean no recorded activity, not proof that nobody used the app. App openings appear only from iOS builds that include session tracking.</div>}
      {report.live && <section className="metrics" aria-label="Live activity">
        <Metric label="Active in the last 15 minutes" value={report.live.active_15m} note="Unique people with a recorded session or successful action" />
        <Metric label="Recent check-ins" value={report.live.checkins_15m} note="Last 15 minutes · no places or coordinates" />
        <Metric label="Recent recorded events" value={report.live.events_15m} note="Last 15 minutes · includes failures and repeat actions" />
      </section>}
      <section className="panel monitor-card" aria-label="Launch-night alerts">
        <div className="section-title"><div><h2>Launch-night alerts</h2><p>{runnerHealth(report.alerts_evaluated_at)} · last check {report.alerts_evaluated_at ? stamp(report.alerts_evaluated_at) : 'unavailable'}</p></div><button className="secondary" onClick={()=>void enableDesktop()}>{desktop?'Disable desktop alerts':'Enable desktop alerts'}</button></div>
        <small>Incidents are saved even when this page is closed. Desktop alerts require this page to stay open. Acknowledging an alert does not resolve its cause.</small>
        {alertError && <p role="alert" className="error">{alertError}</p>}
        {!report.alerts?.length && <p className="monitor-empty">No recorded incidents. Monitoring coverage and the last server check are shown here.</p>}
        <div className="launch-alerts">{report.alerts?.map(a=><article className={`launch-alert ${a.resolved_at?'resolved':a.severity}`} key={a.id}>
          <div><strong>{alertLabels[a.alert_key]?.title ?? 'Launch alert'}</strong><p>{alertLabels[a.alert_key]?.detail}</p><small>{a.resolved_at?'Resolved':a.acknowledged_at?'Acknowledged · still active':a.severity==='critical'?'Needs attention':'Warning'} · observed count {a.observed_count} · opened {stamp(a.opened_at)}</small></div>
          {!a.resolved_at && !a.acknowledged_at && <button className="secondary" disabled={!!alertBusy} onClick={()=>void acknowledge(a.id)}>{alertBusy===a.id?'Saving…':'Acknowledge'}</button>}
        </article>)}</div>
      </section>
      {report.command && <CommandCenterPanels data={report.command} preview={preview} onSettings={onSettings} onWaves={onWaves} />}
      {report.conversion && <section className="panel monitor-card"><h2>Invite conversions</h2><p>People marked invited during the selected period · revoked invitations excluded</p><section className="metrics">
        <Metric label="Invited" value={report.conversion.invited} note="Shared denominator for both conversion rates" />
        <Metric label="Claimed after invitation" value={percentage(report.conversion.claim_percent)} note={`${report.conversion.claimed} of ${report.conversion.invited} invited people`} />
        <Metric label="Completed after claiming" value={percentage(report.conversion.completion_percent)} note={`${report.conversion.completed} of ${report.conversion.invited} invited people`} />
      </section><small>Conversions are observed through now for this invitation cohort. New invitations have had less time to convert. — means no invitations in the period.</small></section>}
      <section className="metrics" aria-label="Recorded activity">
        <Metric label="Active people" value={report.activity.active_users} note="Unique people with a session or successful action" />
        <Metric label="App openers" value={report.activity.app_openers} note="Unique people with a recorded foreground session" />
        <Metric label="Check-ins saved" value={report.activity.checkins} note="New check-in records; no location details" />
        <Metric label="Posts shared" value={report.activity.posts} note="Creation events survive the nightly reset" />
      </section>
      <div className="monitor-grid">
        <section className="panel monitor-card"><h2>Invitations</h2><p>Current guest list · all time · revoked invitations excluded</p><dl>
          <div><dt>On the guest list</dt><dd>{report.invites.selected}</dd></div><div><dt>Marked invited</dt><dd>{report.invites.invited}</dd></div><div><dt>Claimed access</dt><dd>{report.invites.claimed}</dd></div><div><dt>Completed onboarding</dt><dd>{report.invites.joined}</dd></div><div><dt>SMS failures · selected period</dt><dd>{report.invites.sms_failed}</dd></div>
        </dl><small>Manual invitations depend on “mark invited”. These stages are counts, not a conversion cohort.</small></section>
        <section className="panel monitor-card"><h2>Signups & onboarding</h2><p>Selected period · eligible NYC / LA profiles</p><dl>
          <div><dt>New profiles</dt><dd>{report.onboarding.signups}</dd></div><div><dt>New admissions</dt><dd>{report.onboarding.admitted}</dd></div><div><dt>New completions</dt><dd>{report.onboarding.completed}</dd></div><div><dt>Still completing setup · all time</dt><dd>{report.onboarding.incomplete}</dd></div><div><dt>Existing members preserved · all time</dt><dd>{report.onboarding.grandfathered}</dd></div>
        </dl><small>A signup means a profile was created, not an app install. Counts can include different cohorts.</small></section>
      </div>
      <section className="panel"><div className="section-title"><div><h2>Nightly activity</h2><p>Most recent {report.days} local nights · — means not yet instrumented; * means partial coverage</p></div></div>
        <div className="table-scroll"><table><thead><tr><th>Night starting</th><th>City</th><th>Active people</th><th>App openers</th><th>Check-ins</th><th>Posts</th></tr></thead><tbody>
          {report.nightly.map(n=>{
            const usage=nightCoverage(n.night_date,n.city,report.coverage.usage_started_at);
            const extended=nightCoverage(n.night_date,n.city,report.coverage.extended_events_started_at);
            const value=(count:number,coverage:string)=>coverage==='unavailable'?'—':`${count}${coverage==='partial'?' *':''}`;
            return <tr key={n.city+n.night_date}><td>{n.night_date}</td><td>{n.city==='nyc'?'New York':'Los Angeles'}</td><td>{value(n.active_users,usage)}</td><td>{value(n.app_openers,usage)}</td><td>{value(n.checkins,extended)}</td><td>{value(n.posts,extended)}</td></tr>;
          })}
        </tbody></table></div></section>
      <div className="monitor-grid">
        <section className="panel monitor-card"><h2>Social activity</h2><p>Selected period · successful recorded actions</p>
          {report.social.length ? <dl>{report.social.map(s=><div key={s.event}><dt>{actionLabels[s.event] || 'Other action'}<small>{s.people} distinct people</small></dt><dd>{s.events}</dd></div>)}</dl> : <p className="monitor-empty">No social events recorded for this period.</p>}
          <small>Repeat actions count again. A friendship acceptance records both participants.</small>
        </section>
        <section className="panel monitor-card"><h2>Push delivery</h2><p>System-wide · includes testing · attempts may include retries</p><dl>
          <div><dt>Provider accepted</dt><dd>{report.push.accepted}</dd></div><div><dt>Failed logged attempts</dt><dd>{report.push.failed_attempts}</dd></div><div><dt>Skipped by privacy / availability rules</dt><dd>{report.push.skipped}</dd></div><div><dt>Unknown outcomes</dt><dd>{report.push.unknown}</dd></div><div><dt>Queue now · pending / sending</dt><dd>{report.push.pending}</dd></div><div><dt>Overdue by more than 5 minutes</dt><dd>{report.push.overdue}</dd></div><div><dt>Terminal failures still in queue</dt><dd>{report.push.terminal_failed}</dd></div>
          </dl><small>Last logged attempt: {stamp(report.push.last_attempt_at)}. Provider acceptance is not confirmed device delivery. Transport failures can be absent from attempt logs; inspect queue and service logs too.</small>
          <p>Delivery {report.push.delivery_enabled?'enabled':'disabled'} · campaigns {report.push.campaigns_enabled?'enabled':'disabled'}</p>
        </section>
      </div>
      <section className="panel monitor-card"><h2>Technical health</h2><p>Database reachable at snapshot time · no uptime or crash-free claim</p>
        <div className="table-scroll"><table><thead><tr><th>Scheduled job</th><th>Observed state</th><th>Last started</th></tr></thead><tbody>
          {report.health.jobs?.map(j=><tr key={j.name}><td>{j.name}</td><td>{jobHealth(j,report.generated_at)}</td><td>{j.last_run?stamp(j.last_run):'Unavailable'}</td></tr>)}
        </tbody></table></div>
        {!report.health.jobs?.length && <p>No scheduled-job evidence is available.</p>}
        <p className="monitor-note">Job completion confirms the scheduled database command ran; it does not confirm an external service succeeded.</p>
        <h3>Reported action failures</h3>{report.failures.length ? <dl>{report.failures.map(f=><div key={f.feature}><dt>{f.feature}</dt><dd>{f.events}</dd></div>)}</dl>:<p>No instrumented action failures recorded in this period.</p>}
        <small>Action failure coverage includes instrumented plans, plan chat and direct messages. API timing covers instrumented app requests only; see App health for current coverage.</small>
        <a className="monitor-link" href="https://supabase.com/dashboard/project/rwavbyvdytdegntdryll/logs/explorer" target="_blank" rel="noreferrer">Open Supabase service logs ↗</a>
      </section>
      {report.client_health && <section className="panel monitor-card"><h2>Crashes & client errors</h2><p>Private first-party reports · selected period · no error text, stack traces or locations collected</p>
        <section className="metrics"><Metric label="Reported errors" value={report.client_health.reports} note="Render failures, uncaught errors and unhandled rejections"/><Metric label="Affected people" value={report.client_health.affected_people} note="Distinct signed-in people with reports"/><Metric label="Reporting clients" value={report.client_health.reporting_people} note="Distinct people with a health heartbeat"/></section>
        {!report.client_health.last_heartbeat_at && <p className="notice">No health heartbeat has arrived in this period. Zero reports does not establish a crash-free app.</p>}
        {report.client_health.groups.length>0 && <dl>{report.client_health.groups.map(g=><div key={g.platform+g.kind}><dt>{g.platform} · {g.kind.replace(/_/g,' ')}</dt><dd>{g.reports}</dd></div>)}</dl>}
        <p>Last report: {stamp(report.client_health.last_report_at)} · Last heartbeat: {stamp(report.client_health.last_heartbeat_at)}</p>
        <p className="monitor-note">Native iOS / Android process crashes: {report.client_health.native_status==='receiving'?'reports receiving':'not connected'}. Native process crashes and pre-sign-in failures need a native crash reporter and an app release. Browser error reporting is included in this website release.</p>
      </section>}
      <section className="panel monitor-card"><h2>Measurement coverage</h2><dl>
        <div><dt>Existing usage measurement began</dt><dd>{stamp(report.coverage.usage_started_at)}</dd></div>
        <div><dt>Check-in / post / like / comment events began</dt><dd>{stamp(report.coverage.extended_events_started_at)}</dd></div>
        <div><dt>Latest eligible activity</dt><dd>{stamp(report.coverage.last_event_at)}</dd></div>
        <div><dt>Latest recorded app opening</dt><dd>{stamp(report.coverage.last_session_at)}</dd></div>
      </dl><small>Usage history is retained for 90 days. This view is limited to 30 days. Activity before instrumentation is unavailable; it is not reconstructed from private content. Times above use your browser’s timezone.</small></section>
    </>}
  </div>;
}
