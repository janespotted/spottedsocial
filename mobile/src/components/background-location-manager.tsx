import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/hooks/use-session';
import { shouldTrackLiveLocation } from '@/lib/night-status';
import {
  recordPresenceHeartbeat,
  startBackgroundLocation,
  stopBackgroundLocation,
} from '@/lib/background-location';

/** Foreground presence heartbeat cadence (see recordPresenceHeartbeat). */
const HEARTBEAT_MS = 4 * 60 * 1000;

/**
 * Owns the background-tracking lifecycle:
 * - app launch / sign-in: resume tracking if the user is already out at a
 *   venue (never for a private party) and permission was already granted —
 *   startBackgroundLocation never prompts
 * - sign-out: always stop
 * - while the app is in the foreground: a presence heartbeat every few
 *   minutes so a stationary user's pin stays fresh (addendum v3 §8.4)
 * Status changes made in-app (check-in sheet, Stop sharing) call start/stop directly.
 */
export function BackgroundLocationManager() {
  const { session } = useSession();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      stopBackgroundLocation();
      return;
    }
    let cancelled = false;
    shouldTrackLiveLocation(userId).then((track) => {
      if (!cancelled && track) startBackgroundLocation(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    // Not stopped when the user isn't out: a check-in later in the same
    // foreground session must pick the heartbeat up, and the not-out check
    // is a cached read.
    const beat = () => void recordPresenceHeartbeat(userId);
    const start = () => {
      stop();
      beat();
      timer = setInterval(beat, HEARTBEAT_MS);
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [userId]);

  return null;
}
