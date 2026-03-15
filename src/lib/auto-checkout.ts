import { supabase } from '@/integrations/supabase/client';
import { logEvent } from '@/lib/event-logger';
import { stopBackgroundLocation } from '@/lib/background-location';

/**
 * Shared utility to auto-checkout a user:
 * - End active checkins
 * - Clear profile location
 * - Reset night status to 'home'
 */
export async function performAutoCheckout(userId: string, reason: string = 'still_here_no_response') {
  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from('checkins')
      .update({ ended_at: now })
      .eq('user_id', userId)
      .is('ended_at', null),
    supabase
      .from('profiles')
      .update({
        is_out: false,
        last_known_lat: null,
        last_known_lng: null,
        last_location_at: null,
      })
      .eq('id', userId),
    supabase
      .from('night_statuses')
      .update({
        status: 'home' as const,
        venue_name: null,
        venue_id: null,
        lat: null,
        lng: null,
        expires_at: null,
      })
      .eq('user_id', userId),
  ]);

  // Stop background location tracking since user is no longer out
  stopBackgroundLocation();

  logEvent('auto_checkout_stale' as any, { reason });
}
