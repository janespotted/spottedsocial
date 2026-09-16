import { supabase } from './supabase';
import { getNightResetIso, isUnexpired } from './tonight';
import { markManualCheckin } from './venue-arrival-engine';

const STATUS_CACHE_TTL_MS = 60_000;
let _cachedOutResult: { out: boolean; ts: number; userId: string } | null = null;

/**
 * Whether the user is currently "out" with an unexpired status.
 * Result is cached for 60s to avoid a query per background fix.
 * Always fails closed (returns false on error or null expires_at).
 * Port of the web app's night-status.ts.
 */
export async function isUserCurrentlyOut(userId: string): Promise<boolean> {
  const now = Date.now();
  if (
    _cachedOutResult &&
    _cachedOutResult.userId === userId &&
    now - _cachedOutResult.ts < STATUS_CACHE_TTL_MS
  ) {
    return _cachedOutResult.out;
  }
  try {
    const { data, error } = await supabase
      .from('night_statuses')
      .select('status, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      _cachedOutResult = { out: false, ts: now, userId };
      return false;
    }
    // Fail closed: require status='out' AND expires_at in the future
    const out =
      data.status === 'out' && !!data.expires_at && new Date(data.expires_at) > new Date();
    _cachedOutResult = { out, ts: now, userId };
    return out;
  } catch {
    _cachedOutResult = { out: false, ts: now, userId };
    return false;
  }
}

/** Drop the cache — call after any local status write so gates re-check immediately. */
export function invalidateOutStatusCache(): void {
  _cachedOutResult = null;
}

/** Throw on Supabase error so catch blocks actually fire on DB failures. */
function must<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

/**
 * Expiry for every tonight-scoped status row: the next 5 AM in the user's
 * profile-city time zone. Delegates to the single "tonight" definition.
 */
export function getStatusExpiry(city?: string | null): string {
  return getNightResetIso(city);
}

/** The three answers to "Are you out tonight?" plus the legacy heading_out. */
export type NightStatusKind = 'out' | 'planning' | 'home' | 'heading_out';

export interface OwnNightStatus {
  status: NightStatusKind;
  venue_id: string | null;
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
  is_private_party: boolean;
  party_neighborhood: string | null;
  planning_neighborhood: string | null;
  planning_visibility: string | null;
  expires_at: string;
}

/**
 * The user's own status row for TONIGHT, or null when they have not answered
 * the opening prompt yet (no row, or the row expired at the last reset).
 * A `home` row ("No") counts as answered — that is what stops the prompt
 * from repeating the same night.
 */
export async function fetchOwnNightStatus(userId: string): Promise<OwnNightStatus | null> {
  const { data, error } = await supabase
    .from('night_statuses')
    .select(
      'status, venue_id, venue_name, lat, lng, is_private_party, party_neighborhood, planning_neighborhood, planning_visibility, expires_at'
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isUnexpired(data.expires_at)) return null;
  return {
    status: data.status as NightStatusKind,
    venue_id: data.venue_id,
    venue_name: data.venue_name,
    lat: data.lat,
    lng: data.lng,
    is_private_party: !!data.is_private_party,
    party_neighborhood: data.party_neighborhood,
    planning_neighborhood: data.planning_neighborhood,
    planning_visibility: data.planning_visibility,
    expires_at: data.expires_at!,
  };
}

/**
 * Nightly reset, client side. Called when the app notices the user's last
 * status has expired: stops background GPS, clears the profile pin and
 * closes any open check-in so nobody looks live the next morning. Leaves
 * the expired night_statuses row alone — the opening prompt treats an
 * expired row as "not answered", which is exactly what a new night needs.
 */
export async function endNightLocally(userId: string): Promise<void> {
  invalidateOutStatusCache();
  const { stopBackgroundLocation } = await import('./background-location');
  await stopBackgroundLocation();
  await clearUserLocation(userId);
  must(
    await supabase
      .from('checkins')
      .update({ ended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('ended_at', null)
  );
}

/**
 * Clear the user's location from their profile so they no longer appear on
 * friends' maps. Every code path that ends a night must call this.
 */
export async function clearUserLocation(userId: string): Promise<void> {
  must(
    await supabase
      .from('profiles')
      .update({
        is_out: false,
        last_known_lat: null,
        last_known_lng: null,
        last_location_at: null,
      })
      .eq('id', userId)
  );
}

export interface GoPlanningOptions {
  city?: string | null;
  neighborhood?: string | null;
  visibility?: 'close_friends' | 'all_friends' | 'mutual_friends' | null;
  venueId?: string | null;
  venueName?: string | null;
}

/**
 * The ONE way to enter planning mode ("TBD"). Ends open check-ins and clears
 * location, then full-field night_statuses upsert. party_address is never in
 * the upsert payload (WP6) — it's nulled via a separate constant UPDATE.
 */
export async function goPlanning(userId: string, opts: GoPlanningOptions = {}): Promise<void> {
  const now = new Date().toISOString();
  invalidateOutStatusCache();

  must(
    await supabase
      .from('checkins')
      .update({ ended_at: now })
      .eq('user_id', userId)
      .is('ended_at', null)
  );

  await clearUserLocation(userId);

  must(
    await supabase.from('night_statuses').upsert(
      {
        user_id: userId,
        status: 'planning' as const,
        venue_name: null,
        venue_id: null,
        lat: null,
        lng: null,
        updated_at: now,
        expires_at: getStatusExpiry(opts.city),
        planning_neighborhood: opts.neighborhood ?? null,
        planning_venue_id: opts.venueId ?? null,
        planning_venue_name: opts.venueName ?? null,
        planning_visibility: opts.visibility ?? null,
        is_private_party: false,
        party_neighborhood: null,
      },
      { onConflict: 'user_id' }
    )
  );

  must(await supabase.from('night_statuses').update({ party_address: null }).eq('user_id', userId));
}

export interface StopSharingOptions {
  /** Profile city — sets the row's expiry to tonight's reset in that zone. */
  city?: string | null;
}

/**
 * The ONE way to stop sharing / answer "No". Kills background GPS, clears
 * location, ends check-ins, and writes a `home` row that EXPIRES AT THE
 * NEXT RESET. The real expiry is what makes "No" a recorded answer for
 * tonight (the opening prompt does not repeat) while still reading as
 * "not sharing" everywhere else — every reader keys on status/venue, never
 * on the mere presence of an unexpired row.
 */
export async function stopSharing(userId: string, opts: StopSharingOptions = {}): Promise<void> {
  const now = new Date().toISOString();
  invalidateOutStatusCache();

  // Lazy import: background-location imports isUserCurrentlyOut from this
  // module, so a top-level import here would be a require cycle.
  const { stopBackgroundLocation } = await import('./background-location');
  await stopBackgroundLocation();
  await clearUserLocation(userId);

  must(
    await supabase
      .from('checkins')
      .update({ ended_at: now })
      .eq('user_id', userId)
      .is('ended_at', null)
  );

  must(
    await supabase.from('night_statuses').upsert(
      {
        user_id: userId,
        status: 'home' as const,
        venue_name: null,
        venue_id: null,
        lat: null,
        lng: null,
        expires_at: getStatusExpiry(opts.city),
        planning_neighborhood: null,
        planning_venue_id: null,
        planning_venue_name: null,
        planning_visibility: null,
        is_private_party: false,
        party_neighborhood: null,
        updated_at: now,
      },
      { onConflict: 'user_id' }
    )
  );

  must(await supabase.from('night_statuses').update({ party_address: null }).eq('user_id', userId));
}

/**
 * "No, I'm staying in" from the opening prompt. Today identical to
 * stopSharing; kept as its own entry point so "Stop sharing" (keep status,
 * hide location) can diverge from "No" (home for the night) without
 * touching call sites.
 */
export const stayIn = stopSharing;

export interface GoOutOptions {
  venue: { id: string | null; name: string };
  coords?: { lat: number; lng: number } | null;
  city?: string | null;
  privateParty?: { neighborhood: string | null; address?: string | null } | null;
}

/**
 * The ONE way to go "out" at a venue. Full-field night_statuses upsert
 * (party_address never in the payload — WP6), ends prior check-ins and opens
 * a new one. Port of the web goOutAtVenue minus private-party options, which
 * land with the check-in flow. Callers that flip planning→out must also
 * startBackgroundLocation (see BackgroundLocationManager contract).
 */
export async function goOutAtVenue(userId: string, opts: GoOutOptions): Promise<void> {
  const now = new Date().toISOString();
  invalidateOutStatusCache();
  // Every goOutAtVenue call is a user-confirmed venue (sheet, arrival prompt,
  // venue shift) — quiet the arrival engine so GPS disagreement can't re-nudge
  // a venue the user just corrected away from.
  markManualCheckin();
  const lat = opts.coords?.lat ?? null;
  const lng = opts.coords?.lng ?? null;

  must(
    await supabase.from('night_statuses').upsert(
      {
        user_id: userId,
        status: 'out' as const,
        venue_id: opts.venue.id,
        venue_name: opts.venue.name,
        lat,
        lng,
        updated_at: now,
        expires_at: getStatusExpiry(opts.city),
        planning_neighborhood: null,
        planning_venue_id: null,
        planning_venue_name: null,
        planning_visibility: null,
        is_private_party: !!opts.privateParty,
        party_neighborhood: opts.privateParty?.neighborhood ?? null,
      },
      { onConflict: 'user_id' }
    )
  );

  must(
    await supabase
      .from('night_statuses')
      .update({ party_address: opts.privateParty?.address ?? null })
      .eq('user_id', userId)
  );

  // End prior check-ins, open a new one
  must(
    await supabase
      .from('checkins')
      .update({ ended_at: now })
      .eq('user_id', userId)
      .is('ended_at', null)
  );
  const checkin: Record<string, unknown> = {
    user_id: userId,
    venue_id: opts.venue.id,
    venue_name: opts.venue.name,
    started_at: now,
    last_updated_at: now,
  };
  // Omit lat/lng when coords unavailable — never write 0,0
  if (lat !== null && lng !== null) {
    checkin.lat = lat;
    checkin.lng = lng;
  }
  must(await supabase.from('checkins').insert(checkin as never));
}
