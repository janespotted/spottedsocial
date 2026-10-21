import {CommandPeople} from './command-people';
import { useState } from 'react';
import { percentage } from './monitoring-types';

export interface CommandReport {
 started_at:string;
 audience:{eligible_profiles:number;completed_profiles:number;excluded_profiles:number};
 active:{dau:number;wau:number;mau:number;foreground_now:number;last_heartbeat:string|null;foreground_sessions:number;observed_seconds:number};
 activation:{new_profiles:number;completed:number;onboarding_percent:number|null;first_friend:number;first_checkin:number;first_message:number;first_social:number;night_active:number;night_checkin_people:number;night_checkin_percent:number|null;repeat_checkin_people:number};
 graph:{people:number;connections:number;average_friends:number|null;zero_friends:number;three_plus:number;three_plus_percent:number|null;connected_pairs_with_mutuals:number};
 retention:{day:number;eligible:number;returned:number;percent:number|null}[];
 cohorts:{cohort_date:string;completed:number;d1_eligible:number;d7_eligible:number;d30_eligible:number;d1_returned:number;d7_returned:number;d30_returned:number}[];
 funnels:{acquisition:Record<string,number>;friendship:Record<string,number>;notifications:{opened:number;linkable:number;acted:number}};
 friction:{setup_over_24h:number;repeated_errors:number;friend_discovery_no_request:number};
 map_funnel:{opened:number;map:number;venue:number;checkin:number};
 network:{surface:string;requests:number;failures:number;error_percent:number;p95_ms:number}[];
 views:{surface:string;views:number;people:number}[];
 groups_created:number;
 operations?:{peak_sampled_foreground:number|null;last_sample_at:string|null};
 referrals:{invited:number;claimed:number;claimed_per_member:number|null};
 waves:{name:string;selected:number;invited:number;claimed:number;completed:number}[];
 database:{connections:number;max_connections:number};
 email:{status:string;destination:string};
}
const title=(value:string)=>value==='hot_spots'?'Hot Spots':value.replace(/_/g,' ');
function Stat({name,value,note}:{name:string;value:string|number;note:string}) {
 return <div><span>{name}</span><strong>{value}</strong><small>{note}</small></div>;
}
export function CommandCenterPanels({data:c,preview=false}:{data:CommandReport;preview?:boolean}) {
 const [view,setView]=useState('Tonight');
 return <section aria-label="Command Center">
  <div className="command-tabs" role="group" aria-label="Command Center views">{['Tonight','Traction','Journeys','App health','People','Coverage'].map(v=><button className={v===view?'':'secondary'} aria-pressed={v===view} key={v} onClick={()=>setView(v)}>{v}</button>)}</div>
  {view==='Tonight' && <>
   <section className="metrics">
    <Stat name="Foreground now" value={c.active.last_heartbeat?c.active.foreground_now:'—'} note="Instrumented apps only · heartbeat within 90s; may briefly include disconnected phones"/>
    <Stat name="Active · 24 hours" value={c.active.dau} note="Recorded opens, views or successful actions"/>
    <Stat name="Active · 7 days" value={c.active.wau} note="Unique people · rolling window"/>
    <Stat name="Active · 30 days" value={c.active.mau} note="Unique people · partial until 30 days of tracking"/>
   </section>
   {!c.active.last_heartbeat && <p className="notice">Foreground presence and session length are awaiting the instrumented iPhone build. Recent activity is not an online-user count.</p>}
   <div className="monitor-grid"><section className="panel monitor-card"><h2>During the night</h2><dl>
    <div><dt>Active people who checked in</dt><dd>{percentage(c.activation.night_checkin_percent)}</dd></div>
    <div><dt>Checked in / active at night</dt><dd>{c.activation.night_checkin_people} / {c.activation.night_active}</dd></div>
    <div><dt>Checked in on two or more nights</dt><dd>{c.activation.repeat_checkin_people}</dd></div>
    <div><dt>Peak foreground · minute samples</dt><dd>{c.active.last_heartbeat?c.operations?.peak_sampled_foreground??'—':'—'}</dd></div>
    </dl><small>Selected reporting period · each city’s actual night-mode hours; nights roll over at 5 AM. Check-ins are self-reported, not proof of attendance.</small></section>
    <section className="panel monitor-card"><h2>Sessions</h2><dl><div><dt>Recorded foreground segments</dt><dd>{c.active.last_heartbeat?c.active.foreground_sessions:'—'}</dd></div><div><dt>Average observed foreground time</dt><dd>{c.active.last_heartbeat?`${c.active.observed_seconds}s`:'—'}</dd></div><div><dt>Group chats created</dt><dd>{c.groups_created}</dd></div></dl><small>Each foreground entry starts a segment. Duration counts heartbeat-confirmed intervals; missing/offline intervals are excluded. Background location is not app presence.</small></section></div>
   <section className="panel monitor-card"><h2>Screen activity</h2>{c.views.length?<dl>{c.views.map(v=><div key={v.surface}><dt>{title(v.surface)}<small>{v.people} people</small></dt><dd>{v.views}</dd></div>)}</dl>:<p>No screen events received. This requires the new iPhone tracking build.</p>}</section>
  </>}
  {view==='Traction' && <>
   <section className="metrics"><Stat name="Complete onboarding" value={percentage(c.activation.onboarding_percent)} note={`${c.activation.completed} / ${c.activation.new_profiles} new eligible profiles in this period`}/><Stat name="Have at least 3 friends" value={percentage(c.graph.three_plus_percent)} note={`${c.graph.three_plus} / ${c.graph.people} completed members · current graph`}/><Stat name="No friends yet" value={c.graph.zero_friends} note="Current completed members · testers and blocked connections excluded"/></section>
   <section className="panel monitor-card"><h2>Are people coming back?</h2><div className="table-scroll"><table><thead><tr><th>Return day</th><th>Returned</th><th>Mature cohort</th><th>Retention</th></tr></thead><tbody>{c.retention.map(r=><tr key={r.day}><td>D{r.day}</td><td>{r.returned}</td><td>{r.eligible}</td><td>{percentage(r.percent)}</td></tr>)}</tbody></table></div><p>Exact local calendar day after onboarding completion. Only cohorts whose return day has fully ended enter the denominator. — means it is too early or no eligible cohort exists.</p><small>Starts with instrumented completions; preserved existing accounts are excluded. Small launch cohorts are directional evidence, not proof of product-market fit.</small></section>
   <div className="monitor-grid"><section className="panel monitor-card"><h2>Social connections</h2><dl><div><dt>Distinct accepted friendships</dt><dd>{c.graph.connections}</dd></div><div><dt>Average friends per member</dt><dd>{c.graph.average_friends??'—'}</dd></div><div><dt>Connected pairs with mutual friends</dt><dd>{c.graph.connected_pairs_with_mutuals}</dd></div></dl></section><section className="panel monitor-card"><h2>Nomination conversion</h2><dl><div><dt>Nominated people invited</dt><dd>{c.referrals.invited}</dd></div><div><dt>Joined after invitation</dt><dd>{c.referrals.claimed}</dd></div><div><dt>Joined per completed member</dt><dd>{c.referrals.claimed_per_member??'—'}</dd></div></dl><small>Required nominations are tracked separately from organic growth. This is not an organic viral coefficient; there is no reliable organic-source attribution yet.</small></section></div>
   <section className="panel monitor-card"><h2>Onboarding cohorts</h2><div className="table-scroll"><table><thead><tr><th>Completed on</th><th>People</th><th>D1</th><th>D7</th><th>D30</th></tr></thead><tbody>{c.cohorts.map(r=><tr key={r.cohort_date}><td>{r.cohort_date}</td><td>{r.completed}</td>{[1,7,30].map(day=>{const eligible=r[`d${day}_eligible` as keyof typeof r] as number,returned=r[`d${day}_returned` as keyof typeof r] as number;return <td key={day}>{eligible?`${returned} / ${eligible}`:'—'}</td>;})}</tr>)}</tbody></table></div><small>Returned / mature members. Dates follow each member’s city; incomplete return days remain blank.</small></section>
   <section className="panel monitor-card"><h2>Growth by wave</h2><div className="table-scroll"><table><thead><tr><th>Wave</th><th>Selected</th><th>Invited</th><th>Joined</th><th>Onboarded</th></tr></thead><tbody>{c.waves.map((w,i)=><tr key={i}><td>{w.name}</td><td>{w.selected}</td><td>{w.invited}</td><td>{w.claimed}</td><td>{w.completed}</td></tr>)}</tbody></table></div><small>Current nonrevoked invitations. Joined and onboarded exclude test/demo accounts.</small></section>
  </>}
  {view==='Journeys' && <>
   <section className="panel monitor-card"><h2>Invitation → first check-in</h2><dl>{Object.entries(c.funnels.acquisition).map(([name,n])=><div key={name}><dt>{title(name)}</dt><dd>{n}</dd></div>)}</dl><small>Strictly ordered, same invitation cohort since tracking began: marked invited → claimed access → onboarded → accepted friend → check-in. A manually marked invitation is not confirmed receipt.</small></section>
   <section className="panel monitor-card"><h2>Find friends → connect</h2><dl>{Object.entries(c.funnels.friendship).map(([name,n])=><div key={name}><dt>{title(name)}</dt><dd>{n}</dd></div>)}</dl><small>Person-level sequence: discovery → request → acceptance of that request → a social action within 7 days. The discovery and later social action may involve other friends; this is not exact per-friend attribution.</small></section>
   <section className="panel monitor-card"><h2>Notification → relevant action</h2><dl><div><dt>Confirmed device delivery</dt><dd>Unavailable</dd></div><div><dt>Unique notification opens</dt><dd>{c.funnels.notifications.opened}</dd></div><div><dt>Opens with a supported destination</dt><dd>{c.funnels.notifications.linkable}</dd></div><div><dt>Action on that destination within 30m</dt><dd>{c.funnels.notifications.acted}</dd></div></dl><small>Supported destinations: DM reply, plan response/message, invitation response. Opening can occur from the in-app activity list; it is not necessarily a push tap. Provider acceptance and device delivery are different.</small></section>
   <section className="panel monitor-card"><h2>Onboarding → first value</h2><dl>{[['New profiles',c.activation.new_profiles],['Completed onboarding',c.activation.completed],['Added a first friend',c.activation.first_friend],['First check-in',c.activation.first_checkin],['First message',c.activation.first_message],['First social interaction',c.activation.first_social]].map(([label,n])=><div key={label}><dt>{label}</dt><dd>{n}</dd></div>)}</dl><small>Same signup cohort. First-value milestones follow onboarding independently; these are not a strict sequential funnel. Social interaction means a DM, plan message or post comment. Historical milestones before tracking are unavailable.</small></section>
   <section className="panel monitor-card"><h2>Open → map → venue → check-in</h2><dl>{Object.entries(c.map_funnel).map(([name,n])=><div key={name}><dt>{title(name)}</dt><dd>{n}</dd></div>)}</dl><small>Ordered steps in the same recorded foreground segment within 30 minutes. Check-in completion is matched by person and time, not proven causal attribution. Requires the new tracking build.</small></section>
   <section className="metrics"><Stat name="Setup unfinished after 24h" value={c.friction.setup_over_24h} note="May indicate drop-off; not proof of abandonment"/><Stat name="People with repeated errors" value={c.friction.repeated_errors} note="At least three recorded action/API failures in this period"/><Stat name="Discovery without a request" value={c.friction.friend_discovery_no_request} note="No request observed within 30 minutes; may be intentional"/></section>
   <p className="monitor-note">Funnel boundaries and attribution limits are shown with each journey. No private messages or screen recordings are collected.</p>
  </>}
  {view==='App health' && <>
   <section className="panel monitor-card"><h2>Measured API requests</h2><div className="table-scroll"><table><thead><tr><th>Feature</th><th>Requests</th><th>Failed</th><th>Error rate</th><th>p95</th></tr></thead><tbody>{c.network.map(n=><tr key={n.surface}><td>{title(n.surface)}</td><td>{n.requests}</td><td>{n.failures}</td><td>{n.error_percent}%</td><td>{Math.round(n.p95_ms)} ms</td></tr>)}</tbody></table></div>{!c.network.length&&<p>Awaiting API timing events from the instrumented app.</p>}<small>Client-observed HTTP/network outcomes, including denied requests. Not server-only latency. Telemetry is bounded; it may miss offline, crash or rate-limited requests.</small></section>
   <section className="panel monitor-card"><h2>Database snapshot</h2><p>{c.database.connections} / {c.database.max_connections} PostgreSQL connections at snapshot time.</p><small>Includes system and administrative connections. This is capacity context, not concurrent app users. Provider logs remain the source for backend latency and connection failures.</small></section>
   <section className="panel monitor-card"><h2>Critical email alerts</h2><p>{c.email.status==='connected'?'Connected':'Not connected'} · {c.email.destination}</p><small>Dashboard incidents already run every minute. Automatic email delivery requires a configured sender and a verified delivery test. An external uptime monitor is needed to alert during a complete database outage.</small></section>
  </>}
  {view==='People' && <CommandPeople preview={preview} />}
  {view==='Coverage' && <section className="panel monitor-card"><h2>What these numbers can tell you</h2><dl>
   <div><dt>Eligible production profiles</dt><dd>{c.audience.eligible_profiles}</dd></div><div><dt>Excluded demo / tester / other-city profiles</dt><dd>{c.audience.excluded_profiles}</dd></div>
   <div><dt>Server actions and invitations</dt><dd>Live snapshots · ≤15s refresh</dd></div><div><dt>Presence, views, API timing</dt><dd>New app build required</dd></div><div><dt>Retention</dt><dd>Delayed until cohorts mature</dd></div><div><dt>App installs / native process crashes</dt><dd>Unavailable here</dd></div><div><dt>Exact peak concurrency / notification delivery</dt><dd>Unavailable</dd></div><div><dt>Organic referral attribution / viral coefficient</dt><dd>Unavailable</dd></div>
   </dl><p>New tracking starts {new Date(c.started_at).toLocaleString()}. Historical gaps are not backfilled from private content. Existing members who remain marked as testers are excluded until explicitly reclassified.</p><p>Use activation, three-friend adoption, nighttime check-ins, repeated nights and mature retention together. Investigate friction before interpreting a low number as lack of demand.</p></section>}
 </section>;
}
