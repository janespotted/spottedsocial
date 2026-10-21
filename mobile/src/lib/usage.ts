import { supabase } from './supabase';
import { isDemoMode } from './demo-mode';
type Event = 'session_open' | 'plan_started' | 'action_failed' | 'notification_opened';
type Feature = 'plan' | 'plan_chat' | 'dm' | 'venue' | 'notifications' | 'status';
/** Best-effort, bounded events only. Never send content, coordinates or contacts. */
export async function recordUsage(event: Event, feature?: Feature): Promise<void> {
  if (isDemoMode()) return;
  try { await supabase.rpc('record_usage', { p_event: event, p_feature: feature ?? null }); } catch { /* measurement never blocks the action */ }
}

export async function recordNotificationOpen(id: unknown): Promise<void> {
  if (isDemoMode() || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await (supabase.rpc as unknown as (name: string, args: object) => PromiseLike<unknown>)('record_notification_open', { p_notification: id });
  } catch { /* Never interrupt the user's destination. */ }
}
