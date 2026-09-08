import BackgroundGeolocation, { type Location } from 'react-native-background-geolocation';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import { ensureLocationReady, setLocationHandler } from './location-ready';
import { isUserCurrentlyOut } from './night-status';
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

  // Status gate: only write GPS if user is still out with valid expiry
  const stillOut = await isUserCurrentlyOut(userId);
  if (!stillOut) {
    console.log('[BgLocation] User no longer out — self-stopping watcher');
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
 * Does not start tracking; null on denial/timeout.
 */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    await ensureLocationReady();
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

export async function startBackgroundLocation(userId: string): Promise<void> {
  currentUserId = userId;
  try {
    await ensureLocationReady();
    await hydrateArrivalEngine();
    if (isTracking) return;
    const state = await BackgroundGeolocation.start();
    isTracking = state.enabled;
    console.log('[BgLocation] Tracking started:', state.enabled);
  } catch (err) {
    console.error('[BgLocation] Failed to start:', err);
  }
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
