import { supabase } from './supabase';
import { currentPicks } from './venue-recommendations';

export const VENUE_PAGE_SIZE = 24;
export interface DiscoveryVenue {
  id: string;
  name: string;
  neighborhood: string | null;
  type: string | null;
  google_photo_refs: string[] | null;
}

/** Public catalog only: never fetch people, coordinates or live rankings. */
export async function fetchDiscoveryVenues(city: string, search: string, page: number, savedNames?: string[]) {
  if (savedNames && savedNames.length === 0) return [] as DiscoveryVenue[];
  let query = supabase.from('venues')
    .select('id,name,neighborhood,type,google_photo_refs')
    .eq('city', city).eq('is_demo', false)
    .order('name').order('id')
    .range(page * VENUE_PAGE_SIZE, (page + 1) * VENUE_PAGE_SIZE - 1);
  const term = search.trim().replace(/[\\%_]/g, '\\$&');
  if (term) query = query.ilike('name', `%${term}%`);
  if (savedNames) query = query.in('name', savedNames);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DiscoveryVenue[];
}

export async function fetchSavedVenueNames(userId: string) {
  const { data, error } = await supabase.from('wishlist_places').select('venue_name').eq('user_id', userId);
  if (error) throw error;
  return [...new Set((data ?? []).map(row => row.venue_name))].sort();
}

/** Curated ids only; failed/absent recommendations never fall back to random catalog rows. */
export async function fetchFeaturedVenues(city: string) {
  const ids = currentPicks(city).map(p => p.venueId);
  if (!ids.length) return [] as DiscoveryVenue[];
  const { data, error } = await supabase.from('venues')
    .select('id,name,neighborhood,type,google_photo_refs')
    .eq('city', city).eq('is_demo', false).in('id', ids);
  if (error) throw error;
  return (data ?? []) as DiscoveryVenue[];
}
