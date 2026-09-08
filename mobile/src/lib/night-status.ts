import { supabase } from './supabase';
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

function cityToTimezone(city: string | null | undefined): string {
  return city === 'la' ? 'America/Los_Angeles' : 'America/New_York';
}

/**
 * Next 5 AM in the user's city timezone as a UTC ISO string. Port of the web
 * getStatusExpiry; the web reads the cached detected city, here callers pass
 * the profile's home_city (defaults to NY time).
 * DST-safe: derives the UTC offset via Intl at call time.
 */
export function getStatusExpiry(city?: string | null): string {
  const tz = cityToTimezone(city);
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const hour = parseInt(get('hour'), 10) % 24; // Intl can emit "24" at midnight

  // Build the local "now" as a naive Date, then diff against real UTC to get offset
  const localNow = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${String(hour).padStart(2, '0')}:${get('minute')}:${get('second')}`
  );
  const offsetMs = now.getTime() - localNow.getTime();

  // Build 5:00 AM local (naive), convert to UTC
  const fiveAmLocal = new Date(`${get('year')}-${get('month')}-${get('day')}T05:00:00`);
  let fiveAmUTC = new Date(fiveAmLocal.getTime() + offsetMs);

  // If already past 5 AM local, target tomorrow
  if (now >= fiveAmUTC) {
    fiveAmUTC = new Date(fiveAmUTC.getTime() + 86400000);
  }

  return fiveAmUTC.toISOString();
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

/**
 * The ONE way to stop sharing ("Staying In"). Kills background GPS, clears
 * location, ends check-ins, and resets every night_statuses field.
 */
export async function stopSharing(userId: string): Promise<void> {
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
        expires_at: null,
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
