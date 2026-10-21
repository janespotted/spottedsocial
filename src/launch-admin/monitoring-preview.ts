import type { MonitorReport } from './monitoring-types';
// Explicit localhost-only design fixture, reached solely through the existing preview gate.
export function monitoringPreview(days: number): MonitorReport {
 const generated = new Date(), since = new Date(generated.getTime()-days*86400000).toISOString();
 return {
  live:{active_15m:12,checkins_15m:8,events_15m:31},
  conversion:{invited:72,claimed:39,completed:27,claim_percent:54.2,completion_percent:37.5},
  client_health:{reports:2,affected_people:1,reporting_people:18,last_report_at:generated.toISOString(),last_heartbeat_at:generated.toISOString(),native_status:'not_connected',groups:[{platform:'web',kind:'render_error',reports:2}]},
  alerts_evaluated_at:generated.toISOString(),
  alerts:[{id:'preview-alert',alert_key:'push_failures',severity:'warning',observed_count:3,opened_at:generated.toISOString(),last_seen_at:generated.toISOString(),resolved_at:null,acknowledged_at:null}],
  generated_at:generated.toISOString(),since,days,
  coverage:{usage_started_at:since,extended_events_started_at:since,last_event_at:generated.toISOString(),last_session_at:generated.toISOString(),native_crashes:'not_instrumented'},
  invites:{selected:100,invited:72,claimed:39,joined:27,sms_failed:2},
  onboarding:{signups:39,admitted:39,completed:27,incomplete:12,grandfathered:15},
  activity:{active_users:31,app_openers:29,checkins:44,posts:18},
  nightly:Array.from({length:Math.min(days,7)},(_,i)=>({city:'nyc',night_date:new Date(generated.getTime()-i*86400000).toISOString().slice(0,10),active_users:Math.max(0,27-i*4),app_openers:Math.max(0,25-i*4),checkins:Math.max(0,18-i*3),posts:Math.max(0,10-i*2)})),
  social:[{event:'dm_sent',events:58,people:24},{event:'plan_created',events:8,people:7},{event:'post_created',events:18,people:12}],failures:[{feature:'plan',events:2}],
  push:{accepted:142,failed_attempts:3,skipped:9,unknown:0,last_attempt_at:generated.toISOString(),pending:2,overdue:0,terminal_failed:1,delivery_enabled:true,campaigns_enabled:false},
  health:{database:'reachable',jobs:[{name:'spotted-push-delivery',enabled:true,last_run:generated.toISOString(),last_finished:generated.toISOString(),status:'succeeded'},{name:'spotted-usage-cleanup',enabled:true,last_run:generated.toISOString(),last_finished:generated.toISOString(),status:'succeeded'}]},
 };
}
