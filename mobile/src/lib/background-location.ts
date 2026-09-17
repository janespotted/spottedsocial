import BackgroundGeolocation, { type Location } from 'react-native-background-geolocation';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import {
  ensureLocationReady,
  getLocationPermission,
  hasLocationAccess,
  requestAutomaticUpdates,
  setLocationHandler,
  type LocationPermission,
} from './location-ready';
import { shouldTrackLiveLocation } from './night-status';
import { findNearestVenue, distanceMeters } from './location-service';
import {
  canTriggerVenueArrival,
  hydrateArrivalEngine,
  markToastShown,
  recordDeparture,
} from './venue-arrival-engine';

/**
 * Background venue tracking on the Transistorsoft SDK.
 * Port of the web app's background-location.ts pipeline: every fix is
 * status-gated (only writes GPS while the user is "out" with an unexpired
 * status; self-stops otherwise) and updates profiles GPS + the open
 * check-in's freshness timestamp.
 *
 * Privacy invariants (SOW §4):
 * - stopOnTerminate: true — force-quitting the app MUST stop tracking;
 *   the pin must never follow a user after they kill the app.
 * - startOnBoot: false — never resurrect tracking on device reboot.
 */

let isTracking = false;
let currentUserId: string | null = null;

// Plug the fix pipeline into location-ready's permanent dispatcher.
// handleLocation is fully guarded: no user or not "out" → no-op.
setLocationHandler((location) => {
  handleLocation(location).catch((err) =>
    console.error('[BgLocation] handleLocation error:', err)
  );
});

async function handleLocation(location: Location): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;

  // Status gate: only write GPS while out at a VENUE with a valid expiry.
  // A private party never feeds profile coordinates (close-friends-only spot).
  const stillOut = await shouldTrackLiveLocation(userId);
  if (!stillOut) {
    console.log('[BgLocation] User no longer out at a venue — self-stopping watcher');
    stopBackgroundLocation();
    return;
  }

  const { latitude, longitude } = location.coords;
  const now = new Date().toISOString();

  const [{ error: profileErr }, { error: checkinErr }] = await Promise.all([
    supabase
      .from('profiles')
      .update({
        last_known_lat: latitude,
        last_known_lng: longitude,
        last_location_at: now,
      })
      .eq('id', userId),
    supabase
      .from('checkins')
      .update({ last_updated_at: now })
      .eq('user_id', userId)
      .is('ended_at', null),
  ]);
  if (profileErr) console.error('[BgLocation] Profile GPS update error:', profileErr);
  if (checkinErr) console.error('[BgLocation] Checkin timestamp update error:', checkinErr);

  // Auto-venue-tracker decision engine (port of the web venue-arrival-nudge
  // trigger): each fix while "out" evaluates the nearest venue through the
  // hard gates (35m accuracy, 200m radius, 45s dwell, cooldowns). A fired
  // decision delivers a local notification that deep-links to /check-in.
  // Note: dwell needs a second fix ≥45s later at the same venue — with the
  // 100m distanceFilter that's the next natural fix, matching web behavior
  // where the foreground poll re-evaluated on an interval.
  try {
    await runVenueShiftDetection(userId, latitude, longitude, location.coords.accuracy);
  } catch (err) {
    console.warn('[BgLocation] Venue-shift detection error:', err);
  }
}

const venueCoordsCache = new Map<string, { lat: number; lng: number } | null>();

async function getVenueCoords(venueId: string): Promise<{ lat: number; lng: number } | null> {
  if (venueCoordsCache.has(venueId)) return venueCoordsCache.get(venueId) ?? null;
  const { data } = await supabase.from('venues').select('lat, lng').eq('id', venueId).maybeSingle();
  const coords = data?.lat != null && data?.lng != null ? { lat: data.lat, lng: data.lng } : null;
  venueCoordsCache.set(venueId, coords);
  return coords;
}

async function runVenueShiftDetection(
  userId: string,
  lat: number,
  lng: number,
  accuracy: number
): Promise<void> {
  const { data: status } = await supabase
    .from('night_statuses')
    .select('venue_id')
    .eq('user_id', userId)
    .maybeSingle();
  const currentVenueId = status?.venue_id ?? null;

  const nearest = await findNearestVenue(lat, lng, 500);

  // Track departure from the current venue so re-entries don't re-nudge
  if (currentVenueId && nearest?.id !== currentVenueId) {
    const coords = await getVenueCoords(currentVenueId);
    if (coords) {
      recordDeparture(currentVenueId, distanceMeters(lat, lng, coords.lat, coords.lng));
    }
  }

  if (!nearest) return;
  const decision = canTriggerVenueArrival({
    userId,
    status: 'out', // background tracking only runs while out
    currentVenueId,
    detectedVenueId: nearest.id,
    distance: nearest.distance,
    gpsAccuracy: accuracy,
    lat,
    lng,
    timestamp: Date.now(),
  });
  if (!decision.shouldNudge) return;

  markToastShown(nearest.id);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Moved to a new spot?',
      body: `Looks like you're at ${nearest.name} — tap to update your status.`,
      data: { url: '/check-in' },
    },
    trigger: null,
  });
}

/**
 * One-shot GPS fix for foreground features (arrival prompts, smart prompt).
 * Does not start tracking and NEVER prompts — only the check-in Yes path
 * asks for permission, after explaining why. Null when not authorized,
 * on timeout, or on error.
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (!hasLocationAccess(await getLocationPermission())) return null;
    const location = await BackgroundGeolocation.getCurrentPosition({
      timeout: 10,
      samples: 1,
      desiredAccuracy: 40,
      persist: false,
    });
    return { lat: location.coords.latitude, lng: location.coords.longitude };
  } catch {
    return null;
  }
}

export interface TrackingResult {
  /** Whether the watcher is running. */
  tracking: boolean;
  permission: LocationPermission;
}

/**
 * Start the watcher if we are already allowed to. Never prompts: with
 * When In Use it updates while Spotted is open; with Always it keeps going
 * in the background. Not authorized → returns without starting. Safe to
 * call at launch (BackgroundLocationManager) and after every check-in.
 */
export async function startBackgroundLocation(userId: string): Promise<TrackingResult> {
  currentUserId = userId;
  let permission: LocationPermission = 'not_determined';
  try {
    permission = await getLocationPermission();
    if (!hasLocationAccess(permission)) return { tracking: false, permission };
    await hydrateArrivalEngine();
    if (isTracking) return { tracking: true, permission };
    const state = await BackgroundGeolocation.start();
    isTracking = state.enabled;
    console.log('[BgLocation] Tracking started:', state.enabled);
    return { tracking: isTracking, permission };
  } catch (err) {
    console.error('[BgLocation] Failed to start:', err);
    return { tracking: false, permission };
  }
}

/**
 * The explicit "automatic updates" step after a successful check-in:
 * asks for Always (+ Motion & Fitness), then starts the watcher with
 * whatever the user granted. The check-in itself is already saved by the
 * time this runs, so nothing here can make it look failed.
 */
export async function enableAutomaticUpdates(userId: string): Promise<TrackingResult> {
  try {
    await requestAutomaticUpdates();
  } catch (err) {
    console.warn('[BgLocation] Automatic updates request failed:', err);
  }
  return startBackgroundLocation(userId);
}

export async function stopBackgroundLocation(): Promise<void> {
  if (!isTracking) return;
  isTracking = false;
  try {
    await BackgroundGeolocation.stop();
    console.log('[BgLocation] Tracking stopped');
  } catch (err) {
    console.error('[BgLocation] Failed to stop:', err);
  }
}

/**
 * Presence heartbeat (addendum v3 §8.4). The watcher writes a fix only
 * after 100 m of movement, so a user standing in a venue writes nothing and
 * their pin reads as stale. While the app is in the foreground and the
 * user is out at a venue, refresh `last_location_at` every few minutes —
 * with a fresh fix when one is available, otherwise stamp only, which keeps
 * the last shared spot and proves the session is alive. Never prompts;
 * a no-op (false) when the user isn't out at a venue.
 */
export async function recordPresenceHeartbeat(userId: string): Promise<boolean> {
  try {
    if (!(await shouldTrackLiveLocation(userId))) return false;
    const now = new Date().toISOString();
    const fix = await getCurrentPosition();
    const profile: Record<string, unknown> = { last_location_at: now };
    if (fix) {
      profile.last_known_lat = fix.lat;
      profile.last_known_lng = fix.lng;
    }
    await Promise.all([
      supabase.from('profiles').update(profile as never).eq('id', userId),
      supabase
        .from('checkins')
        .update({ last_updated_at: now })
        .eq('user_id', userId)
        .is('ended_at', null),
    ]);
    return true;
  } catch (err) {
    console.warn('[BgLocation] Heartbeat failed:', err);
    return true; // transient — keep trying
  }
}
