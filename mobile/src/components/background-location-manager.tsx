import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSession } from '@/hooks/use-session';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { recordPresenceHeartbeat, retryPendingLocation, startBackgroundLocation, stopBackgroundLocation } from '@/lib/background-location';
import { getLocationPermission } from '@/lib/location-ready';

/** Foreground/reconnect recovery plus status-driven lifecycle. Native motion
 * events own background sampling; JS timers are never sold as background GPS. */
export function BackgroundLocationManager() {
  const { session } = useSession();
  const userId = session?.user.id;
  const { data: own } = useOwnNightStatus();
  const revision = own?.status?.updated_at;
  const kind = own?.status?.status;
  const party = own?.status?.is_private_party;
  useEffect(() => {
    if (!userId) { void stopBackgroundLocation(); return; }
    if (own && (kind !== 'out' || party)) { void stopBackgroundLocation(); return; }
    void startBackgroundLocation(userId);
  }, [userId, revision, kind, party, !!own]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let busy = false;
    let disposed = false;
    const beat = async () => {
      if (disposed || busy) return;
      busy = true;
      try { await recordPresenceHeartbeat(userId); } finally { busy = false; }
    };
    const sync = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (AppState.currentState === 'active') {
        void beat();
        timer = setInterval(() => void beat(), 60_000);
      } else {
        void getLocationPermission().then((permission) => {
          if (!disposed && AppState.currentState !== 'active' && permission !== 'always') void stopBackgroundLocation();
        }).catch(() => {});
      }
    };
    sync();
    const app = AppState.addEventListener('change', sync);
    const network = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false && !disposed) {
        void retryPendingLocation();
        if (AppState.currentState === 'active') void beat();
      }
    });
    return () => { disposed = true; if (timer) clearInterval(timer); app.remove(); network(); };
  }, [userId]);
  return null;
}
