import type { MonitorReport } from './monitoring-types';
// Explicit localhost-only design fixture, reached solely through the existing preview gate.
export function monitoringPreview(days: number): MonitorReport {
 const generated = new Date(), since = new Date(generated.getTime()-days*86400000).toISOString();
 return {
  command:commandPreview(),
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

export function commandPreview() {
 return {
  started_at:'2026-10-22T00:00:00Z',audience:{eligible_profiles:100,completed_profiles:80,excluded_profiles:32},
  active:{dau:61,wau:78,mau:80,foreground_now:24,last_heartbeat:new Date().toISOString(),foreground_sessions:93,observed_seconds:247},
  activation:{new_profiles:100,completed:80,onboarding_percent:80,first_friend:62,first_checkin:48,first_message:36,first_social:41,night_active:61,night_checkin_people:48,night_checkin_percent:78.7,repeat_checkin_people:17},
  graph:{people:80,connections:164,average_friends:4.1,zero_friends:9,three_plus:53,three_plus_percent:66.3,connected_pairs_with_mutuals:92},
  retention:[{day:1,eligible:40,returned:21,percent:52.5},{day:7,eligible:0,returned:0,percent:null},{day:30,eligible:0,returned:0,percent:null}],
  cohorts:[],friction:{setup_over_24h:8,repeated_errors:2,friend_discovery_no_request:7},
  map_funnel:{opened:93,map:61,venue:42,checkin:29},
  funnels:{acquisition:{invited:100,joined:88,onboarded:80,friend:62,checkin:48},friendship:{discovered:70,requested:56,accepted:42,interaction:31},notifications:{opened:38,linkable:30,acted:19}},
  network:[{surface:'venue',requests:260,failures:3,error_percent:1.2,p95_ms:640}],
  views:[{surface:'map',views:152,people:61},{surface:'hot_spots',views:84,people:42}],groups_created:8,
  referrals:{invited:82,claimed:19,claimed_per_member:.24},waves:[{name:'First 100',selected:100,invited:100,claimed:88,completed:80}],
  database:{connections:18,max_connections:100},email:{status:'not_configured',destination:'jane@joinspottedapp.com'},
  operations:{peak_sampled_foreground:31,last_sample_at:new Date().toISOString()},
 };
}
