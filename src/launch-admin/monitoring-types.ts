import type { CommandReport } from './command-center';
export interface MonitorReport {
  command?: CommandReport;
  live?: { active_15m: number; checkins_15m: number; events_15m: number };
  conversion?: { invited: number; claimed: number; completed: number; claim_percent: number | null; completion_percent: number | null };
  client_health?: { reports: number; affected_people: number; reporting_people: number; last_report_at: string | null; last_heartbeat_at: string | null; native_status: string; groups: { platform: string; kind: string; reports: number }[] };
  alerts_evaluated_at?: string | null;
  alerts?: LaunchAlert[];
  generated_at: string; since: string; days: number;
  coverage: { usage_started_at: string; extended_events_started_at: string; last_event_at: string | null; last_session_at: string | null; native_crashes: string };
  invites: { selected: number; invited: number; claimed: number; joined: number; sms_failed: number };
  onboarding: { signups: number; admitted: number; completed: number; incomplete: number; grandfathered: number };
  activity: { active_users: number; app_openers: number; checkins: number; posts: number };
  nightly: { city: string; night_date: string; active_users: number; app_openers: number; checkins: number; posts: number }[];
  social: { event: string; events: number; people: number }[];
  failures: { feature: string; events: number }[];
  push: { accepted: number; failed_attempts: number; skipped: number; unknown: number; last_attempt_at: string | null; pending: number; overdue: number; terminal_failed: number; delivery_enabled: boolean; campaigns_enabled: boolean };
  health: { database: string; jobs: { name: string; enabled: boolean; last_run: string | null; last_finished: string | null; status: string }[] | null };
}
export const actionLabels: Record<string,string> = {
  plan_created: 'Plans created', plan_response: 'Plan responses', plan_message: 'Plan messages', dm_sent: 'Direct messages',
  status_shared: 'Statuses shared', venue_saved: 'Places saved', friend_request: 'Friend requests',
  friendship_accepted: 'Friend connections · participant events', invite_sent: 'In-app invitations', invite_responded: 'Invitation responses',
  post_created: 'Posts created', post_comment: 'Post comments', post_like: 'Post likes',
};
export function monitoringError(error: { code?: string } | null) {
  if (error?.code === '42501') return 'Founder monitoring access is required for this account.';
  if (['PGRST202','42883'].includes(error?.code ?? '')) return 'Monitoring is not available on this backend yet. The dashboard update is ready; its database migration still needs deployment.';
  return 'Monitoring could not refresh. Retry to get a current snapshot.';
}
// A scheduled SQL job only confirms its own completion, not an external push response.
export function jobHealth(job: NonNullable<MonitorReport['health']['jobs']>[number], generated: string) {
  if (!job.enabled) return 'Disabled';
  if (!job.last_run || job.status === 'unknown') return 'No run evidence';
  if (job.status === 'failed') return 'Failed';
  const age = new Date(generated).getTime() - new Date(job.last_run).getTime();
  const limit = job.name === 'spotted-push-delivery' ? 5 * 60_000 : 26 * 60 * 60_000;
  if (!Number.isFinite(age) || age > limit) return 'Stale';
  if (job.status === 'running' && age > 5 * 60_000) return 'Long running';
  return job.status === 'running' ? 'Running' : 'Completed';
}

export function nightCoverage(night: string, city: string, began: string): 'unavailable' | 'partial' | 'available' {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: city === 'la' ? 'America/Los_Angeles' : 'America/New_York', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23' }).formatToParts(new Date(began));
  const part = (type: string) => parts.find(p=>p.type===type)!.value;
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`);
  if (Number(part('hour')) < 5) date.setUTCDate(date.getUTCDate()-1);
  const firstNight = date.toISOString().slice(0,10);
  return night < firstNight ? 'unavailable' : night === firstNight ? 'partial' : 'available';
}

export interface LaunchAlert {
 id: string; alert_key: string; severity: 'warning' | 'critical'; observed_count: number;
 opened_at: string; last_seen_at: string; resolved_at: string | null; acknowledged_at: string | null;
}
export const alertLabels: Record<string,{title:string;detail:string}> = {
 api_errors:{title:'API requests are failing',detail:'At least 10 server/network failures among 20 or more measured requests in 5 minutes. Check service logs and recent app changes.'},
 api_slow:{title:'API requests are slow',detail:'Measured p95 exceeds 2 seconds across at least 20 requests in 5 minutes. This includes the phone’s network time.'},
 reset_job:{title:'Nightly reset needs attention',detail:'A known NYC/LA reset job failed, was disabled, or has no run evidence within 26 hours. Verify expiration and scheduler logs.'},
 database_capacity:{title:'Database connections are high',detail:'Observed connections exceed 80% of the configured database limit. Inspect the connection pool and backend traffic.'},
 activity_drop:{title:'Foreground activity dropped',detail:'At least 20 foreground users were sampled 15–30 minutes ago; now 2 or fewer remain. Check for outages or a natural end to the night.'},
 email_delivery:{title:'Email alerts could not be sent',detail:'An alert email exhausted its retries. Check the sender credentials, verified domain and provider logs.'},
 email_worker:{title:'Email alert worker is stale',detail:'Email is enabled but the worker has not checked in within 5 minutes. Inspect the email worker and sender configuration.'},
 push_backlog: {title:'Push queue is overdue',detail:'Pending or sending items are more than 5 minutes overdue. Check the push worker and provider logs.'},
 push_failures: {title:'Push attempts are failing',detail:'At least 3 logged failures in 15 minutes, excluding privacy and availability skips.'},
 push_terminal: {title:'Push delivery exhausted its retries',detail:'At least one terminal failure remains in the push queue. Inspect provider and transport failures before retrying.'},
 push_disabled: {title:'Push delivery is switched off',detail:'Notifications are waiting while delivery is disabled. Check the launch delivery setting.'},
 client_errors: {title:'App errors reported',detail:'At least one client error was reported in 15 minutes. Review error coverage below.'},
 action_failures: {title:'Product actions are failing',detail:'At least 5 recorded action failures in 15 minutes. Review affected features below.'},
 sms_failures: {title:'Invitation SMS failed',detail:'At least one failed or undelivered invitation was updated in the last 15 minutes.'},
 push_job: {title:'Push worker needs attention',detail:'Work is waiting and the scheduled worker is disabled, missing or has no successful/running job in 5 minutes.'},
};
export const percentage = (value:number|null|undefined) => value == null ? '—' : `${value}%`;
export function runnerHealth(at:string|null|undefined, now:number=Date.now()) {
 if (!at) return 'Waiting for the first alert check';
 const age=now-Date.parse(at);
 return !Number.isFinite(age) || age>150_000 ? 'Alert checks are stale — inspect the scheduler' : 'Server checks running every minute';
}
