import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
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
 * Registers this device's raw APNs token onto the signed-in user's profile —
 * the RN counterpart of the web usePushNotifications subscribeNative flow.
 * The send-push edge function reads profiles.apns_device_token and talks to
 * APNs directly, so a plain device token (not an Expo push token) is required.
 *
 * Runs after onboarding so the permission prompt doesn't stack on top of the
 * location prompt in the welcome flow. Simulators can't issue APNs tokens —
 * the try/catch makes that a silent no-op.
 */
export function PushNotificationManager() {
  const { session, onboardingNeeded } = useSession();

  useEffect(() => {
    if (!session || onboardingNeeded) return;
    let cancelled = false;

    (async () => {
      try {
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          ({ status } = await Notifications.requestPermissionsAsync());
        }
        if (status !== 'granted' || cancelled) return;

        const token = (await Notifications.getDevicePushTokenAsync()).data as string;
        if (!token || cancelled) return;

        // Detach this token from any other account first (SECURITY DEFINER
        // RPC — RLS blocks touching other users' profiles directly).
        // Casts: database.types.ts predates the push columns/RPC; both are
        // verified present in the production schema.
        await (supabase.rpc as (fn: string, args: object) => PromiseLike<unknown>)(
          'clear_stale_push_token',
          { p_token: token, p_keep_user_id: session.user.id }
        );
        await supabase
          .from('profiles')
          .update({
            push_token: token,
            apns_device_token: token,
            push_enabled: true,
          } as never)
          .eq('id', session.user.id);
      } catch {
        /* denied, simulator, or offline — in-app notifications still work */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, onboardingNeeded]);

  // Tapping a push routes by payload (venue-shift → check-in), else Activity
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      router.push(typeof url === 'string' && url.startsWith('/') ? (url as '/activity') : '/activity');
    });
    return () => sub.remove();
  }, []);

  return null;
}
