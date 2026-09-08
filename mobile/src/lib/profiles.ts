import { DEMO_MODE } from './demo-mode';
import { supabase } from './supabase';

/**
 * Shape returned by the get_profiles_safe() RPC — the server-side function that
 * masks GPS/PII per the privacy model. Cross-user profile reads must go through
 * this, never through direct selects on `profiles` (see SOW §4).
 */
export interface SafeProfile {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  is_demo: boolean;
  last_known_lat: number | null;
  last_known_lng: number | null;
  location_sharing_level: string | null;
}

export async function fetchProfilesSafe(): Promise<SafeProfile[]> {
  const { data, error } = await supabase.rpc('get_profiles_safe');
  if (error) throw error;
  // Demo content must never reach the launched app (SOW §15); DEMO_MODE is
  // dev-only, so release builds always filter demo profiles out.
  return ((data ?? []) as SafeProfile[]).filter((p) => DEMO_MODE || !p.is_demo);
}

export function buildProfileMap(profiles: SafeProfile[]): Map<string, SafeProfile> {
  return new Map(profiles.map((p) => [p.id, p]));
}
