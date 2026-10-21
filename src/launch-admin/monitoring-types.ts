export interface MonitorReport {
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
