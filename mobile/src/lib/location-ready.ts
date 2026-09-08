import BackgroundGeolocation, { type Location } from 'react-native-background-geolocation';
// Enums are NOT runtime exports of the main package — only its typings
// declare them. The real values live in the types package.
import { DesiredAccuracy, LogLevel } from '@transistorsoft/background-geolocation-types';

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
 * Privacy invariants (SOW §4):
 * - stopOnTerminate: true — force-quitting the app MUST stop tracking;
 *   the pin must never follow a user after they kill the app.
 * - startOnBoot: false — never resurrect tracking on device reboot.
 */

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

export function ensureLocationReady(): Promise<void> {
  if (!readyPromise) {
    if (!dispatcherRegistered) {
      dispatcherRegistered = true;
      BackgroundGeolocation.onLocation(
        (location) => locationHandler?.(location),
        (error) => console.warn('[Location] Location error:', error)
      );
    }
    readyPromise = BackgroundGeolocation.ready({
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
    }).then(() => {
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
