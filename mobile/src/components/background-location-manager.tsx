import { useEffect } from 'react';
import { useSession } from '@/hooks/use-session';
import { isUserCurrentlyOut } from '@/lib/night-status';
import { startBackgroundLocation, stopBackgroundLocation } from '@/lib/background-location';

/**
 * Owns the background-tracking lifecycle:
 * - app launch / sign-in: resume tracking if the user is already "out"
 * - sign-out: always stop
 * Status changes made in-app (Home status card) call start/stop directly.
 */
export function BackgroundLocationManager() {
  const { session } = useSession();

  useEffect(() => {
    if (!session) {
      stopBackgroundLocation();
      return;
    }
    let cancelled = false;
    isUserCurrentlyOut(session.user.id).then((out) => {
      if (!cancelled && out) startBackgroundLocation(session.user.id);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}
