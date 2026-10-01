import { getSessionRevision } from './session-identity';
import { supabase } from './supabase';
import { getNightResetIso, isUnexpired } from './tonight';
import { markManualCheckin } from './venue-arrival-engine';
import { automaticUpdatesEnabled, getLocationPermission } from './location-ready';
import { validFix } from './location-quality';

const STATUS_CACHE_TTL_MS = 60_000;
let _cachedOutResult: {
  out: boolean;
  privateParty: boolean;
  ts: number;
  userId: string;
} | null = null;

async function getOutState(userId: string): Promise<{ out: boolean; privateParty: boolean }> {
  const now = Date.now();
  const revision = getSessionRevision();
  if (
    _cachedOutResult &&
    _cachedOutResult.userId === userId &&
    now - _cachedOutResult.ts < STATUS_CACHE_TTL_MS
  ) {
    return _cachedOutResult;
  }
  let out = false;
  let privateParty = false;
  try {
    const { data, error } = await supabase
      .from('night_statuses')
      .select('status, expires_at, is_private_party')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) {
      // Fail closed: require status='out' AND expires_at in the future
      out = data.status === 'out' && !!data.expires_at && new Date(data.expires_at) > new Date();
      privateParty = out && !!data.is_private_party;
    }
  } catch {
    /* fail closed */
  }
  if (revision !== getSessionRevision()) return { out: false, privateParty: false };
  _cachedOutResult = { out, privateParty, ts: now, userId };
  return _cachedOutResult;
}

/**
 * Whether the user is currently "out" with an unexpired status.
 * Result is cached for 60s to avoid a query per background fix.
 * Always fails closed (returns false on error or null expires_at).
 * Port of the web app's night-status.ts.
 */
export async function isUserCurrentlyOut(userId: string): Promise<boolean> {
  return (await getOutState(userId)).out;
}

/**
 * Gate for the background GPS pipeline: out at a venue, NOT at a private
 * party. A party host's exact spot is for close friends only and lives in
 * party_locations; profile coordinates are readable by the whole audience,
 * so a party must never feed them.
 */
export async function shouldTrackLiveLocation(userId: string): Promise<boolean> {
  const s = await getOutState(userId);
  return s.out && !s.privateParty;
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

/**
 * The three answers to "Are you out tonight?" (out / planning / home), plus
 * `off` = "Stop sharing": still out tonight, but hidden from friends. Every
 * friend-facing reader keys on out/planning, so an `off` row is invisible
 * to others while still counting as "answered tonight" for the owner.
 * `heading_out` is legacy.
 */
export type NightStatusKind = 'out' | 'planning' | 'home' | 'off' | 'heading_out';

export interface OwnNightStatus {
  updated_at: string;
  automatic_venue_updates: boolean;
  manual_venue_until?: string | null;
  /** night_statuses.id — binds party consent to this active session. */
  id: string;
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
    .rpc('get_own_night_status')
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId || !isUnexpired(data.expires_at)) return null;

  // A private party's exact spot never rests on the status row (DB trigger
  // moves it to party_locations); the owner reads their own row back here.
  let lat = data.lat;
  let lng = data.lng;
  if (data.is_private_party) {
    const { data: party } = await supabase
      .from('party_locations')
      .select('lat, lng')
      .eq('user_id', userId)
      .maybeSingle();
    lat = party?.lat ?? null;
    lng = party?.lng ?? null;
  }
  return {
    id: data.id,
    updated_at: data.updated_at ?? '',
    automatic_venue_updates: data.automatic_venue_updates,
    manual_venue_until: data.manual_venue_until,
    status: data.status as NightStatusKind,
    venue_id: data.venue_id,
    venue_name: data.venue_name,
    lat,
    lng,
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
  const { pauseLocationForStatusChange } = await import('./background-location');
  await pauseLocationForStatusChange(userId);
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
 * The ONE way to enter planning mode ("TBD"). Stops GPS, writes the status,
 * then ends open check-ins and clears location. The caller-bound RPC clears
 * the address in the same transaction without granting raw column reads.
 */
export async function goPlanning(userId: string, opts: GoPlanningOptions = {}): Promise<void> {
  const { pauseLocationForStatusChange } = await import('./background-location');
  await pauseLocationForStatusChange(userId);
  const now = new Date().toISOString();
  invalidateOutStatusCache();

  must(
    await supabase.rpc('commit_night_status', {
      p_patch: {
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
        party_address: null,
      },
    })
  );
}

export interface StopSharingOptions {
  /** Profile city — sets the row's expiry to tonight's reset in that zone. */
  city?: string | null;
}

/**
 * Shared tail of "Stop sharing" and "No": stop background GPS, write the
 * status, then clear the profile pin and end open check-ins. The status uses
 * TONIGHT'S EXPIRY. The real expiry is what makes either a recorded answer
 * (the opening prompt does not repeat) while reading as "not sharing"
 * everywhere else — readers key on status/venue, never on row presence.
 */
async function endLiveSharing(
  userId: string,
  status: 'home' | 'off',
  opts: StopSharingOptions
): Promise<void> {
  const now = new Date().toISOString();
  invalidateOutStatusCache();

  // Lazy import: background-location imports fetchOwnNightStatus from this
  // module, so a top-level import here would be a require cycle.
  const { pauseLocationForStatusChange } = await import('./background-location');
  await pauseLocationForStatusChange(userId);
  must(
    await supabase.rpc('commit_night_status', {
      p_patch: {
        user_id: userId,
        status,
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
        party_address: null,
        updated_at: now,
      },
    })
  );
}

/**
 * "Stop sharing" — the user may still be out, but becomes invisible:
 * location, venue and check-in are dropped and the row becomes `off`.
 * Distinct from "No" (see stayIn): the answer for tonight stays "out".
 */
export function stopSharing(userId: string, opts: StopSharingOptions = {}): Promise<void> {
  return endLiveSharing(userId, 'off', opts);
}

/** "No, I'm staying in" — records `home` for the night. */
export function stayIn(userId: string, opts: StopSharingOptions = {}): Promise<void> {
  return endLiveSharing(userId, 'home', opts);
}

export interface GoOutOptions {
  venue: { id: string | null; name: string };
  coords?: { lat: number; lng: number; accuracy?: number; recordedAt?: string } | null;
  city?: string | null;
  audience?: 'close_friends' | 'all_friends' | 'mutual_friends';
  privateParty?: { neighborhood: string | null; address?: string | null } | null;
}

/** Commit status, audience, profile GPS and active visit in one server transaction.
 * The server validates real fixes and controls expiry/revision. Private-party
 * coordinates remain in the separately authorized party store; they never
 * enter profile GPS or ordinary check-in history. Address approval stays separate.
 */
export async function goOutAtVenue(userId: string, opts: GoOutOptions): Promise<{ gpsShared: boolean; trackingReady: boolean }> {
  const { pauseLocationForStatusChange, allowLocationAfterCheckin } = await import('./background-location');
  await pauseLocationForStatusChange(userId);
  const automatic = !opts.privateParty && await automaticUpdatesEnabled() && await getLocationPermission() === 'always';
  invalidateOutStatusCache();
  const fix = opts.coords?.recordedAt && opts.coords.accuracy != null
    ? { ...opts.coords, recordedAt: opts.coords.recordedAt, accuracy: opts.coords.accuracy, speed: null } : null;
  const result = must(await supabase.rpc('commit_night_status', {
    p_patch: {
      user_id: userId, status: 'out', automatic_venue_updates: automatic,
      venue_id: opts.venue.id, venue_name: opts.venue.name,
      planning_neighborhood: null, planning_venue_id: null, planning_venue_name: null, planning_visibility: null,
      is_private_party: !!opts.privateParty, party_neighborhood: opts.privateParty?.neighborhood ?? null,
      party_address: opts.privateParty?.address ?? null,
    },
    p_fix: fix && validFix(fix) ? fix : undefined,
    p_audience: opts.audience,
  })) as { gps_shared: boolean };
  markManualCheckin();
  // Server save is complete. A local tracking/storage failure is a separate outcome.
  let trackingReady = false;
  if (!opts.privateParty) {
    try { await allowLocationAfterCheckin(userId); trackingReady = true; } catch { /* show manual status, retry automatic readiness separately */ }
  }
  return { gpsShared: result.gps_shared, trackingReady };
}
