import { recordNotificationOpen } from '@/lib/usage';
import { isVisibleConversation } from '@/lib/conversation-notifications';
import { isDemoMode, useDemoMode } from '@/lib/demo-mode';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { deferDeepLink, getNightGateState, takePendingDeepLink } from '@/lib/night-gate';
import { registerPushToken, routeForNotification } from '@/lib/push';
import { useSession } from '@/hooks/use-session';
import { useNightMode } from '@/hooks/use-night-mode';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { LIVE_ACTIVITY_TYPES, withholdLivePreview } from '@/lib/live-preview';

let foregroundUser: string | undefined;
let foregroundLiveAllowed = false;
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const receiver = notification.request.content.data?.receiver_id;
    const type = notification.request.content.data?.type;
    const live = typeof type === 'string' && LIVE_ACTIVITY_TYPES.includes(type);
    const allowed = !isDemoMode() && !!foregroundUser && (typeof receiver !== 'string' || receiver === foregroundUser) && (!live || foregroundLiveAllowed);
    const alreadyReading = !!foregroundUser && AppState.currentState === 'active' && isVisibleConversation(foregroundUser, notification.request.content.data ?? {});
    return {
      shouldShowBanner: allowed && !alreadyReading, shouldShowList: allowed && !alreadyReading,
      shouldPlaySound: allowed && !alreadyReading, shouldSetBadge: allowed && !alreadyReading,
    };
  },
});

/** Retry registration on foreground, connectivity and token rotation.
 * Failed writes never latch registration as successful. */
export function PushNotificationManager() {
  const { session, onboardingNeeded, onboardingResolved } = useSession();
  const demo = useDemoMode();
  const userId = demo ? undefined : session?.user.id;
  const own = useOwnNightStatus();
  const { isNight } = useNightMode();
  const liveAllowed = isNight && !withholdLivePreview(own.data?.status?.status, !!own.data && !own.isError);
  useEffect(() => {
    foregroundLiveAllowed = liveAllowed;
    if (!liveAllowed) void Notifications.getPresentedNotificationsAsync().then(rows => Promise.all(rows.filter(n => {
      const type = n.request.content.data?.type;
      return typeof type === 'string' && LIVE_ACTIVITY_TYPES.includes(type);
    }).map(n => Notifications.dismissNotificationAsync(n.request.identifier)))).catch(() => {});
    return () => { foregroundLiveAllowed = false; };
  }, [userId, liveAllowed]);
  const seen = useRef(new Set<string>());
  const previousUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    foregroundUser = userId;
    if (previousUser.current && previousUser.current !== userId) {
      takePendingDeepLink();
      seen.current.clear();
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }
    previousUser.current = userId;
    if (!userId || !onboardingResolved || onboardingNeeded) return;
    let cancelled = false;
    let busy = false;
    let again = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let rotatedToken: string | undefined;
    const register = async (prompt: boolean) => {
      if (cancelled) return;
      if (busy) { again = true; return; }
      busy = true;
      if (retry) clearTimeout(retry);
      retry = undefined;
      try {
        const token = rotatedToken;
        rotatedToken = undefined;
        await registerPushToken(userId, { prompt, token });
        failures = 0;
      } catch {
        failures += 1;
        if (!cancelled && AppState.currentState === 'active')
          retry = setTimeout(() => void register(false), Math.min(60_000, 5_000 * 2 ** Math.min(failures - 1, 4)));
      } finally {
        busy = false;
        if (again && !cancelled) { again = false; void register(false); }
      }
    };
    // Retire the old unconditional local recap; the server checks actual recap content.
    void Notifications.cancelScheduledNotificationAsync('morning-after-recap').catch(() => {});
    void register(false);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') void register(false);
      else if (retry) { clearTimeout(retry); retry = undefined; }
    });
    const network = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false && AppState.currentState === 'active') void register(false);
    });
    const tokens = Notifications.addPushTokenListener((token) => {
      if (typeof token.data === 'string') rotatedToken = token.data;
      void register(false);
    });
    return () => { cancelled = true; if (retry) clearTimeout(retry); app.remove(); network(); tokens.remove(); };
  }, [userId, onboardingNeeded, onboardingResolved]);

  // Listen AND consume the initial response after auth resolves, deduplicating
  // the same cold-start tap delivered through both paths.
  useEffect(() => {
    if (!userId || !onboardingResolved || onboardingNeeded) return;
    let cancelled = false;
    const handle = (response: Notifications.NotificationResponse | null) => {
      if (cancelled || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const notification = response.notification;
      const key = `${notification.request.identifier}:${response.actionIdentifier}`;
      if (seen.current.has(key)) return;
      const data = notification.request.content.data;
      seen.current.add(key);
      if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value!);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      if (typeof data?.receiver_id === 'string' && data.receiver_id !== userId) return;
      void recordNotificationOpen(data?.notification_id);
      const target = routeForNotification(data);
      const live = typeof data?.type === 'string' && LIVE_ACTIVITY_TYPES.includes(data.type);
      if (!live) { router.push(target); return; }
      const expiry = typeof data?.expires_at === 'string' ? Date.parse(data.expires_at) : NaN;
      if (!isNight || (Number.isFinite(expiry) && expiry <= Date.now())) { router.push('/activity'); return; }
      if (getNightGateState() !== 'answered') {
        if (!String(target).startsWith('/check-in')) deferDeepLink(target);
      } else router.push(target);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    return () => { cancelled = true; sub.remove(); };
  }, [userId, onboardingNeeded, onboardingResolved, isNight]);
  return null;
}
