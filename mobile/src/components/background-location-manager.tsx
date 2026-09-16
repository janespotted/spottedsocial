import { useEffect } from 'react';
import { useSession } from '@/hooks/use-session';
import { shouldTrackLiveLocation } from '@/lib/night-status';
import { startBackgroundLocation, stopBackgroundLocation } from '@/lib/background-location';

/**
 * Owns the background-tracking lifecycle:
 * - app launch / sign-in: resume tracking if the user is already out at a
 *   venue (never for a private party) and permission was already granted —
 *   startBackgroundLocation never prompts
 * - sign-out: always stop
 * Status changes made in-app (check-in sheet, Stop sharing) call start/stop directly.
 */
export function BackgroundLocationManager() {
  const { session } = useSession();

  useEffect(() => {
    if (!session) {
      stopBackgroundLocation();
      return;
    }
    let cancelled = false;
    shouldTrackLiveLocation(session.user.id).then((track) => {
      if (!cancelled && track) startBackgroundLocation(session.user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}
