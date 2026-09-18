import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { deferDeepLink, getNightGateState } from '@/lib/night-gate';
import { registerPushToken, routeForNotification } from '@/lib/push';
import { useSession } from '@/hooks/use-session';

// Show pushes that arrive while the app is foregrounded (banner + list).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Push lifecycle: registers the APNs token after onboarding (so the prompt
 * doesn't stack on the location prompt in the welcome flow), re-registers
 * on every return to the foreground without prompting — that is how a user
 * who enabled notifications in iOS Settings gets a token (addendum v3 §8.6)
 * — and routes taps.
 */
export function PushNotificationManager() {
  const { session, onboardingNeeded, onboardingResolved } = useSession();
  const userId = session?.user.id;
  const registered = useRef(false);

  useEffect(() => {
    registered.current = false;
    // Wait for the profile check to ANSWER: `onboardingNeeded` reads false
    // while it is still unknown, which would prompt for notifications during
    // signup — exactly the prompt stacking this component exists to avoid.
    if (!userId || !onboardingResolved || onboardingNeeded) return;
    let cancelled = false;
    const register = async (prompt: boolean) => {
      if (registered.current) return;
      const result = await registerPushToken(userId, { prompt });
      if (!cancelled && result === 'granted') registered.current = true;
    };
    void register(true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void register(false);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [userId, onboardingNeeded, onboardingResolved]);

  // Tapping a push routes by type. While the opening "Are you out tonight?"
  // question is unanswered (or not yet known on a cold start) the link is
  // parked and replayed by NightStatusGate once the user answers — a
  // notification never bypasses it.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = routeForNotification(
        response.notification.request.content.data as Record<string, unknown> | undefined
      );
      if (getNightGateState() !== 'answered') {
        // The gate is already presenting the check-in sheet — nothing to replay
        if (!String(target).startsWith('/check-in')) deferDeepLink(target);
        return;
      }
      router.push(target);
    });
    return () => sub.remove();
  }, []);

  return null;
}
