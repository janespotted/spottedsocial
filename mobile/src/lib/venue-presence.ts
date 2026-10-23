import { supabase } from './supabase';
import { isDemoMode } from './demo-mode';

export interface VenuePresence {
  user_id: string; venue_id: string | null; status: string;
  expires_at: string | null; updated_at: string | null;
  is_demo: boolean | null; is_private_party: boolean | null;
}

/** Consume an RLS-authorized snapshot, not historical check-in actions.
 * updated_at resolves duplicate rows only; it never proves a new arrival.
 */
export function eligibleVenuePresence(rows: VenuePresence[], demo: boolean, now = Date.now()): VenuePresence[] {
  const current = new Map<string, VenuePresence>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const old = current.get(row.user_id);
    if (!old || (row.updated_at ?? '') > (old.updated_at ?? '')) current.set(row.user_id, row);
  }
  return [...current.values()].filter(row => row.status === 'out' && !!row.venue_id
    && !row.is_private_party && (demo || row.is_demo === false)
    && !!row.expires_at && Date.parse(row.expires_at) > now);
}

/** Same query for Hot Spots and venue cards; RLS supplies audience/block/hide checks. */
export async function fetchVisibleVenuePresence(venueId?: string): Promise<VenuePresence[]> {
  const demo = isDemoMode();
  let query = supabase.from('night_statuses')
    .select('user_id,venue_id,status,expires_at,updated_at,is_demo,is_private_party')
    .eq('status', 'out').not('venue_id', 'is', null)
    .not('expires_at', 'is', null).gt('expires_at', new Date().toISOString());
  if (venueId) query = query.eq('venue_id', venueId);
  if (!demo) query = query.eq('is_demo', false);
  const { data, error } = await query;
  if (error) throw error;
  return eligibleVenuePresence(data ?? [], demo);
}
