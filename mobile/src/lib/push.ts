import * as Notifications from 'expo-notifications';
import type { Href } from 'expo-router';
import { supabase } from './supabase';

/**
 * Where a tapped push lands (addendum v3 §8.6). The send-push function puts a
 * WEB route in `data.url` (`/messages?tab=activity`, `/profile/friend-requests`…)
 * because the same function serves the web app; those paths do not exist
 * here and used to push an unmatched route. Route by `type` instead. Local
 * notifications from the arrival engine set `url: '/check-in'` themselves
 * and are honoured as-is.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): Href {
  const url = typeof data?.url === 'string' ? data.url : '';
  if (url.startsWith('/check-in')) return url as Href;
  switch (data?.type) {
    case 'dm':
    case 'venue_yap':
      return '/messages';
    case 'friend_checkin':
    case 'friend_arrived_venue':
    case 'friends_at_venue':
      return '/map';
    case 'venue_arrival_planning':
      return '/check-in';
    default:
      // meetup/invite/friend/post/plan activity all live in the Activity inbox
      return '/activity';
  }
}

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export async function getPushPermission(): Promise<PushPermission> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    return status === 'denied' || !canAskAgain ? 'denied' : 'undetermined';
  } catch {
    return 'denied';
  }
}

/**
 * Registers this device's raw APNs token onto the signed-in user's profile —
 * the RN counterpart of the web usePushNotifications subscribeNative flow.
 * The send-push edge function reads profiles.apns_device_token and talks to
 * APNs directly, so a plain device token (not an Expo push token) is required.
 * Prompts only when permission is undetermined. Simulators can't issue APNs
 * tokens — failures are silent; in-app notifications still work.
 */
export async function registerPushToken(
  userId: string,
  opts: { prompt: boolean }
): Promise<PushPermission> {
  try {
    let permission = await getPushPermission();
    if (permission === 'undetermined' && opts.prompt) {
      const { status } = await Notifications.requestPermissionsAsync();
      permission = status === 'granted' ? 'granted' : 'denied';
    }
    if (permission !== 'granted') return permission;

    const token = (await Notifications.getDevicePushTokenAsync()).data as string;
    if (!token) return permission;

    // Detach this token from any other account first (SECURITY DEFINER
    // RPC — RLS blocks touching other users' profiles directly).
    // Casts: database.types.ts predates the push columns/RPC; both are
    // verified present in the production schema.
    await (supabase.rpc as (fn: string, args: object) => PromiseLike<unknown>)(
      'clear_stale_push_token',
      { p_token: token, p_keep_user_id: userId }
    );
    await supabase
      .from('profiles')
      .update({ push_token: token, apns_device_token: token, push_enabled: true } as never)
      .eq('id', userId);
    return permission;
  } catch {
    return 'denied';
  }
}
