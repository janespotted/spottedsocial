/**
 * Consolidated status transition helpers (WP2).
 *
 * Every "go out", "stop sharing", and "go planning" write in the app
 * must flow through these functions so behaviour stays consistent.
 */

import { supabase } from '@/integrations/supabase/client';
import { getCachedCity, type SupportedCity } from './city-detection';
import { clearUserLocation } from './clear-user-location';
import { stopBackgroundLocation } from './background-location';
import { markManualCheckin } from './auto-venue-tracker';

// ── City → timezone mapping ──────────────────────────────────────────

function cityToTimezone(city: SupportedCity): string {
  switch (city) {
    case 'la': return 'America/Los_Angeles';
    case 'nyc':
    case 'pb':
    default: return 'America/New_York';
  }
}

// ── Timer registry ───────────────────────────────────────────────────

const locationTimerCleanups: Set<() => void> = new Set();

/** Register a cleanup function that `stopAllLocationTimers` will call. */
export function registerLocationTimer(cleanup: () => void): void {
  locationTimerCleanups.add(cleanup);
}

/** Kill every registered location timer (CheckInModal 60s, auto-venue heartbeat, etc.). */
export function stopAllLocationTimers(): void {
  for (const cleanup of locationTimerCleanups) {
    cleanup();
  }
  locationTimerCleanups.clear();
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Throw on Supabase error so catch blocks actually fire on DB failures.
 * Use for every write in the helpers below.
 */
export function must<T>(result: { data: T; error: any }): T {
  if (result.error) throw result.error;
  return result.data;
}

/**
 * Next 5 AM in the user's detected city timezone as a UTC ISO string.
 * Falls back to America/New_York when no city is cached.
 * DST-safe: derives the UTC offset via Intl at call time.
 */
export function getStatusExpiry(): string {
  const city = getCachedCity() || 'nyc';
  const tz = cityToTimezone(city);
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
  const minute = parts.find(p => p.type === 'minute')!.value;
  const second = parts.find(p => p.type === 'second')!.value;

  // Build the local "now" as a naive Date, then diff against real UTC to get offset
  const localNow = new Date(
    `${year}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:${second}`
  );
  const offsetMs = now.getTime() - localNow.getTime();

  // Build 5:00 AM local (naive), convert to UTC
  const fiveAmLocal = new Date(`${year}-${month}-${day}T05:00:00`);
  let fiveAmUTC = new Date(fiveAmLocal.getTime() + offsetMs);

  // If already past 5 AM local, target tomorrow
  if (now >= fiveAmUTC) {
    fiveAmUTC = new Date(fiveAmUTC.getTime() + 86400000);
  }

  return fiveAmUTC.toISOString();
}

// ── Cached status gate ────────────────────────────────────────────────

let _cachedOutResult: { out: boolean; ts: number; userId: string } | null = null;
const STATUS_CACHE_TTL_MS = 60_000;

/**
 * Cached check: is the user currently status='out' with an unexpired expires_at?
 * Result is cached for 60s to avoid a query per background fix.
 * Always fails closed (returns false on error or null expires_at).
 */
export async function isUserCurrentlyOut(userId: string): Promise<boolean> {
  const now = Date.now();
  if (_cachedOutResult && _cachedOutResult.userId === userId && now - _cachedOutResult.ts < STATUS_CACHE_TTL_MS) {
    return _cachedOutResult.out;
  }
  try {
    const { data, error } = await supabase
      .from('night_statuses')
      .select('status, expires_at')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      _cachedOutResult = { out: false, ts: now, userId };
      return false;
    }
    // Fail closed: require status='out' AND expires_at in the future
    const out = data.status === 'out' && !!data.expires_at && new Date(data.expires_at) > new Date();
    _cachedOutResult = { out, ts: now, userId };
    return out;
  } catch {
    _cachedOutResult = { out: false, ts: Date.now(), userId };
    return false;
  }
}

/** Invalidate the cached out status (call on stop-sharing / status change). */
export function invalidateOutStatusCache(): void {
  _cachedOutResult = null;
}

// ── Status transitions ───────────────────────────────────────────────

/**
 * The ONE way to stop sharing.
 * Ordered so location clears first (privacy-critical).
 */
export async function stopSharing(userId: string): Promise<void> {
  const now = new Date().toISOString();

  // 0. Invalidate cached status so background callbacks see "not out" immediately
  invalidateOutStatusCache();

  // 1. Kill all location timers + background GPS watcher
  stopAllLocationTimers();
  stopBackgroundLocation();

  // 2. Remove user from friends' maps immediately
  await clearUserLocation(userId);

  // 3. End open check-ins
  must(await supabase
    .from('checkins')
    .update({ ended_at: now })
    .eq('user_id', userId)
    .is('ended_at', null));

  // 4. Full-field night_statuses reset — every venue/party/planning field nulled
  must(await supabase
    .from('night_statuses')
    .upsert({
      user_id: userId,
      status: 'home' as const,
      venue_name: null,
      venue_id: null,
      lat: null,
      lng: null,
      expires_at: null,
      planning_neighborhood: null,
      planning_visibility: null,
      is_private_party: false,
      party_neighborhood: null,
      party_address: null,
      updated_at: now,
    }, { onConflict: 'user_id' }));
}

export interface GoOutOptions {
  venue: { id: string | null; name: string };
  coords?: { lat: number; lng: number } | null;
  source?: string;
  privateParty?: { neighborhood: string | null; address?: string | null };
}

/**
 * The ONE way to go out at a venue.
 * Full-field NS upsert, end prior check-ins, insert new, update profile.
 * Never writes `location_sharing_level` (WP7).
 * Never writes 0,0 — omits lat/lng when coords are unavailable.
 */
export async function goOutAtVenue(userId: string, opts: GoOutOptions): Promise<void> {
  const now = new Date().toISOString();
  const lat = opts.coords?.lat ?? null;
  const lng = opts.coords?.lng ?? null;

  // Full-field NS upsert
  must(await supabase
    .from('night_statuses')
    .upsert({
      user_id: userId,
      status: 'out' as const,
      venue_id: opts.venue.id,
      venue_name: opts.venue.name,
      lat,
      lng,
      updated_at: now,
      expires_at: getStatusExpiry(),
      planning_neighborhood: null,
      planning_visibility: null,
      is_private_party: opts.privateParty ? true : false,
      party_neighborhood: opts.privateParty?.neighborhood ?? null,
      party_address: opts.privateParty?.address ?? null,
    }, { onConflict: 'user_id' }));

  // End prior check-ins
  must(await supabase
    .from('checkins')
    .update({ ended_at: now })
    .eq('user_id', userId)
    .is('ended_at', null));

  // Create new check-in — omit lat/lng when coords unavailable (never 0,0)
  const checkinData: Record<string, any> = {
    user_id: userId,
    venue_id: opts.venue.id,
    venue_name: opts.venue.name,
    started_at: now,
    last_updated_at: now,
  };
  if (opts.coords) {
    checkinData.lat = opts.coords.lat;
    checkinData.lng = opts.coords.lng;
  }
  must(await supabase.from('checkins').insert(checkinData));

  // Update profile — omit lat/lng when coords unavailable
  const profileData: Record<string, any> = {
    is_out: true,
    last_location_at: now,
  };
  if (opts.coords) {
    profileData.last_known_lat = opts.coords.lat;
    profileData.last_known_lng = opts.coords.lng;
  }
  must(await supabase
    .from('profiles')
    .update(profileData)
    .eq('id', userId));

  // Mark manual check-in for auto-tracker cooldown
  if (opts.source === 'manual' || opts.source === 'arrival' || opts.source === 'venue_shift') {
    markManualCheckin();
  }
}

export interface GoPlanningOptions {
  neighborhood?: string | null;
  visibility?: 'close_friends' | 'all_friends' | 'mutual_friends' | null;
}

/**
 * The ONE way to enter planning mode.
 * Ends open check-ins and clears location (bug fix: previously missing
 * from QuickStatusSheet + PlansFeed), then full-field NS upsert.
 */
export async function goPlanning(userId: string, opts: GoPlanningOptions = {}): Promise<void> {
  const now = new Date().toISOString();

  // End open check-ins
  must(await supabase
    .from('checkins')
    .update({ ended_at: now })
    .eq('user_id', userId)
    .is('ended_at', null));

  // Clear location from map
  await clearUserLocation(userId);

  // Full-field NS upsert
  must(await supabase
    .from('night_statuses')
    .upsert({
      user_id: userId,
      status: 'planning' as const,
      venue_name: null,
      venue_id: null,
      lat: null,
      lng: null,
      updated_at: now,
      expires_at: getStatusExpiry(),
      planning_neighborhood: opts.neighborhood ?? null,
      planning_visibility: opts.visibility ?? null,
      is_private_party: false,
      party_neighborhood: null,
      party_address: null,
    }, { onConflict: 'user_id' }));
}
