import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export type EventType = 
  | 'user_login'
  | 'location_update'
  | 'invite_sent'
  | 'invite_received'
  | 'invite_accepted'
  | 'invite_declined'
  | 'private_party_checkin';

/**
 * Lightweight event logger for internal debugging
 * Fire-and-forget - never blocks UI or throws errors
 */
export const logEvent = async (
  eventType: EventType,
  eventData: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fire and forget - don't await
    supabase
      .from('event_logs')
      .insert([{
        user_id: user.id,
        event_type: eventType,
        event_data: eventData as Json,
        metadata: {
          ...metadata,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          timestamp: new Date().toISOString(),
        } as Json,
      }])
      .then(({ error }) => {
        if (error) console.warn('Event log failed:', error.message);
      });
  } catch (e) {
    // Silently fail - never crash the app
    console.warn('Event logging error:', e);
  }
};
