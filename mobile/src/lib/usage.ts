import { supabase } from './supabase';
import { isDemoMode } from './demo-mode';
type Event = 'session_open' | 'plan_started' | 'action_failed' | 'notification_opened';
type Feature = 'plan' | 'plan_chat' | 'dm' | 'venue' | 'notifications' | 'status';
/** Best-effort, bounded events only. Never send content, coordinates or contacts. */
export async function recordUsage(event: Event, feature?: Feature): Promise<void> {
  if (isDemoMode()) return;
  try { await supabase.rpc('record_usage', { p_event: event, p_feature: feature ?? null }); } catch { /* measurement never blocks the action */ }
}
