import BackgroundGeolocation, {
  DesiredAccuracy,
  LogLevel,
  type Location,
} from 'react-native-background-geolocation';
import { supabase } from './supabase';
import { isUserCurrentlyOut } from './night-status';

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

let isReady = false;
let isTracking = false;
let currentUserId: string | null = null;

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

  // TODO(port): venue-arrival nudges, friends-nearby pushes, and the
  // auto-venue-tracker decision engine from the web app land here next.
}

async function ensureReady(): Promise<void> {
  if (isReady) return;

  BackgroundGeolocation.onLocation(
    (location) => {
      handleLocation(location).catch((err) =>
        console.error('[BgLocation] handleLocation error:', err)
      );
    },
    (error) => console.warn('[BgLocation] Location error:', error)
  );

  await BackgroundGeolocation.ready({
    geolocation: {
      desiredAccuracy: DesiredAccuracy.High,
      distanceFilter: 100, // metres — parity with the Capacitor watcher
      stopTimeout: 5, // minutes stationary before motion tracking pauses
      locationAuthorizationRequest: 'Always',
    },
    app: {
      stopOnTerminate: true, // privacy invariant — see header comment
      startOnBoot: false, // privacy invariant — see header comment
    },
    logger: {
      debug: false,
      logLevel: __DEV__ ? LogLevel.Verbose : LogLevel.Error,
    },
  });

  isReady = true;
}

export async function startBackgroundLocation(userId: string): Promise<void> {
  currentUserId = userId;
  try {
    await ensureReady();
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
