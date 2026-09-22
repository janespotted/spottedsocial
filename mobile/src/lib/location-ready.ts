import BackgroundGeolocation, { type Location } from 'react-native-background-geolocation';
// Enums are NOT runtime exports of the main package — only its typings
// declare them. The real values live in the types package.
import {
  AuthorizationStatus,
  DesiredAccuracy,
  LogLevel,
  PersistMode,
} from '@transistorsoft/background-geolocation-types';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * THE single owner of BackgroundGeolocation.ready().
 *
 * Contract (see mobile/LOCATION.md):
 * - .ready() is called EXACTLY ONCE per app launch (single-flight promise —
 *   concurrent callers share the same in-flight configuration).
 * - Every SDK call that touches GPS (getCurrentPosition, start) MUST await
 *   ensureLocationReady() first. Never call BackgroundGeolocation.ready()
 *   or configure the plugin anywhere else.
 *
 * Permission staging (client feedback §3):
 * - The plugin is configured for **When In Use** only. The first GPS fix
 *   (Yes → "Looks like you're at…") therefore shows just the standard
 *   location prompt — no Motion & Fitness, no background-location upgrade.
 * - "Automatic updates" (Always + motion activity) is a separate, explained
 *   step offered AFTER a check-in has already succeeded
 *   (requestAutomaticUpdates). Once granted, the choice is remembered so
 *   later launches configure the plugin for Always from the start.
 * - The SDK's own "open Settings" alert is disabled; the check-in sheet owns
 *   that UI and re-checks permission when the app returns to the foreground.
 *
 * Privacy invariants (SOW §4):
 * - stopOnTerminate: true — force-quitting the app MUST stop tracking;
 *   the pin must never follow a user after they kill the app.
 * - startOnBoot: false — never resurrect tracking on device reboot.
 */

export type LocationPermission = 'not_determined' | 'denied' | 'when_in_use' | 'always';

const AUTO_UPDATES_KEY = 'spotted.automatic-updates';

let readyPromise: Promise<void> | null = null;
let locationHandler: ((location: Location) => void) | null = null;
let dispatcherRegistered = false;

/**
 * The fix pipeline (background-location.ts) plugs in here. A permanent
 * dispatcher listener is registered alongside ready() so the SDK never
 * emits `location` events with no listener attached (one-shot
 * getCurrentPosition fixes emit them too).
 */
export function setLocationHandler(handler: (location: Location) => void): void {
  locationHandler = handler;
}

export async function automaticUpdatesEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AUTO_UPDATES_KEY)) === '1';
  } catch {
    return false;
  }
}

export function ensureLocationReady(): Promise<void> {
  if (!readyPromise) {
    if (!dispatcherRegistered) {
      dispatcherRegistered = true;
      BackgroundGeolocation.onLocation(
        (location) => locationHandler?.(location),
        (error) => console.warn('[Location] Location error:', error)
      );
    }
    readyPromise = automaticUpdatesEnabled()
      .then((auto) =>
        BackgroundGeolocation.ready({
          geolocation: {
            desiredAccuracy: DesiredAccuracy.High,
            distanceFilter: 25, // walking-scale movement; SDK elasticity saves battery in cars
            stopTimeout: 5, // minutes stationary before motion tracking pauses
            // Staged: When In Use until the user opts into automatic updates
            locationAuthorizationRequest: auto ? 'Always' : 'WhenInUse',
            // We own the "location is off" UI (check-in sheet), not the SDK
            disableLocationAuthorizationAlert: true,
          },
          activity: {
            // Motion & Fitness is only requested with automatic updates
            disableMotionActivityUpdates: !auto,
          },
          app: {
            stopOnTerminate: true, // privacy invariant — see header comment
            startOnBoot: false, // privacy invariant — see header comment
          },
          persistence: { persistMode: PersistMode.None },
          logger: {
            debug: false,
            logLevel: __DEV__ ? LogLevel.Verbose : LogLevel.Error,
          },
        })
      )
      .then(() => {
        // ready() resolves with plugin State; consumers only need "configured"
      });
    // A failed ready() (e.g. native module missing in a stale dev client)
    // must not poison every future call — allow a retry on next use.
    readyPromise.catch(() => {
      readyPromise = null;
    });
  }
  return readyPromise;
}

/** Current authorization without prompting. `denied` also covers device location services being off. */
export async function getLocationPermission(): Promise<LocationPermission> {
  await ensureLocationReady();
  const state = await BackgroundGeolocation.getProviderState();
  // `status` is the APP's authorization; `enabled` is whether the DEVICE's
  // Location Services are switched on. Read status first: a granted app on
  // a phone with location services off is still granted, and reporting it
  // as `denied`/`not_determined` made the map re-prompt someone who had
  // already said yes (and can't be prompted again by iOS anyway).
  switch (state.status) {
    case AuthorizationStatus.Always:
      return 'always';
    case AuthorizationStatus.WhenInUse:
      return 'when_in_use';
    case AuthorizationStatus.NotDetermined:
      // Never asked — unless the device itself has location off, in which
      // case prompting would do nothing and Settings is the only way.
      return state.enabled ? 'not_determined' : 'denied';
    default:
      return 'denied';
  }
}

export const hasLocationAccess = (p: LocationPermission) => p === 'always' || p === 'when_in_use';

/**
 * The standard "While Using the App" prompt, for a control the user just
 * tapped that needs a fix (map recenter). Only meaningful while permission
 * is not_determined — once iOS has an answer the prompt never shows again
 * and the caller should point at Settings instead. Never waits forever.
 */
export async function requestWhenInUse(): Promise<LocationPermission> {
  await ensureLocationReady();
  try {
    await Promise.race([
      BackgroundGeolocation.requestPermission(),
      new Promise((resolve) => setTimeout(resolve, 10000)),
    ]);
  } catch {
    /* declined — the status below says what we actually have */
  }
  return getLocationPermission();
}

/**
 * The "automatic updates" step: upgrade to Always and enable motion
 * activity. Shows the iOS background-location upgrade prompt (and Motion &
 * Fitness). Call only after the user has been told why and has tapped a
 * button for it — never as a side effect of checking in.
 */
export async function requestAutomaticUpdates(): Promise<LocationPermission> {
  await ensureLocationReady();
  // requestPermission() asks for whatever mode the config expects
  await BackgroundGeolocation.setConfig({
    geolocation: { locationAuthorizationRequest: 'Always' },
    activity: { disableMotionActivityUpdates: false },
  });
  try {
    await BackgroundGeolocation.requestPermission();
  } catch {
    /* declined — the status below says what we actually have */
  }
  const permission = await getLocationPermission();
  try {
    await AsyncStorage.setItem(AUTO_UPDATES_KEY, permission === 'always' ? '1' : '0');
  } catch {
    /* best effort */
  }
  return permission;
}

/** Bound native tracking to this night's server-checked expiry, including while suspended. */
export async function configureTrackingDeadline(expiresAt: string): Promise<void> {
  await ensureLocationReady();
  const minutes = (Date.parse(expiresAt) - Date.now()) / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('Night expired');
  await BackgroundGeolocation.setConfig({ geolocation: { stopAfterElapsedMinutes: minutes } });
}
