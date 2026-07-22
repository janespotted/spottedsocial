import { supabase } from '@/integrations/supabase/client';

/**
 * Clear a user's location from their profile so they no longer appear on
 * friends' maps. This is the single source of truth for "stop showing my
 * location" — every code path that ends a user's night (going home, stop
 * sharing, planning, auto-checkout) must call this.
 */
export async function clearUserLocation(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      is_out: false,
      last_known_lat: null,
      last_known_lng: null,
      last_location_at: null,
    })
    .eq('id', userId);
  if (error) throw error;
}
