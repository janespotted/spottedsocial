import { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';
import { actionLabels, jobHealth, monitoringError, nightCoverage, type MonitorReport } from './monitoring-types';
const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'No events recorded';
function Metric({label,value,note}: {label: string; value: number | string; note: string}) {
  return <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}
export function Monitoring({preview}: {preview: boolean}) {
  const [days,setDays] = useState(7), [revision,setRevision] = useState(0);
  const [report,setReport] = useState<MonitorReport | null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setReport(null); setError(''); setBusy(true);
    async function load() {
      try {
        if (preview && import.meta.env.DEV) {
          const { monitoringPreview } = await import('./monitoring-preview');
          if (!cancelled) setReport(monitoringPreview(days));
        } else {
          const {data,error: failure} = await (supabase as any).rpc('launch_monitor',{p_days: days}).abortSignal(controller.signal);
          if (failure) throw failure;
          if (!data || data.days !== days || !Array.isArray(data.nightly)) throw Error('Invalid monitoring response');
          if (!cancelled) setReport(data);
        }
      } catch (e) { if (!cancelled) setError(monitoringError(e as {code?: string})); }
      finally { if (!cancelled) setBusy(false); }
    }
    void load();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    return () => { cancelled=true; controller.abort(); clearTimeout(timeout); };
  },[days,revision,preview]);
  // Refresh only while visible; account changes unmount this component in App.
  useEffect(() => {
    if (preview) return;
    const timer=setInterval(() => { if(document.visibilityState==='visible') setRevision(n=>n+1); },60_000);
    return () => clearInterval(timer);
  },[preview]);
  return <div className="monitoring" aria-busy={busy}>
    <div className="monitor-toolbar">
      <label>Reporting period<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></select></label>
      <button className="secondary" disabled={busy} onClick={()=>setRevision(n=>n+1)}>{busy ? 'Refreshing…' : 'Refresh now'}</button>
      <small role="status">{report ? `Snapshot ${stamp(report.generated_at)} · refreshes every minute while visible` : busy ? 'Loading aggregate metrics…' : 'Current snapshot unavailable'}</small>
    </div>
    {error && <div role="alert" className="error">{error}</div>}
    {report && <>
      <div className="monitor-note">Founder access · aggregate counts only. Product activity excludes demo accounts, night-mode testers and excluded accounts. Nightly windows run from 5am to 5am in each profile city. Current nights are partial.</div>
      {!report.coverage.last_event_at && <div className="notice">No eligible usage events have arrived yet. Zeros below mean no recorded activity, not proof that nobody used the app. App-open coverage requires an iOS build containing UsageManager.</div>}
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
        <small>Client failure coverage is currently limited to plans, plan chat and direct messages. Native crash reporting and full API latency/error monitoring are not connected here.</small>
        <a className="monitor-link" href="https://supabase.com/dashboard/project/rwavbyvdytdegntdryll/logs/explorer" target="_blank" rel="noreferrer">Open Supabase service logs ↗</a>
      </section>
      <section className="panel monitor-card"><h2>Measurement coverage</h2><dl>
        <div><dt>Existing usage measurement began</dt><dd>{stamp(report.coverage.usage_started_at)}</dd></div>
        <div><dt>Check-in / post / like / comment events began</dt><dd>{stamp(report.coverage.extended_events_started_at)}</dd></div>
        <div><dt>Latest eligible activity</dt><dd>{stamp(report.coverage.last_event_at)}</dd></div>
        <div><dt>Latest recorded app opening</dt><dd>{stamp(report.coverage.last_session_at)}</dd></div>
      </dl><small>Usage history is retained for 90 days. This view is limited to 30 days. Activity before instrumentation is unavailable; it is not reconstructed from private content. Times above use your browser’s timezone.</small></section>
    </>}
  </div>;
}
