import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
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
  const details = (data?.data && typeof data.data === 'object' ? data.data : {}) as Record<string, unknown>;
  const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
  const url = typeof data?.url === 'string' ? data.url : '';
  if (url.startsWith('/check-in')) return url as Href;
  switch (data?.type) {
    case 'dm':
      return uuid(details.thread_id) ? `/thread?threadId=${details.thread_id}` as Href : '/messages?tab=dms' as Href;
    case 'venue_yap':
      return '/messages';
    case 'post_tag':
    case 'post_like':
    case 'post_comment':
      return uuid(details.post_id) ? `/post-detail?postId=${details.post_id}` as Href : '/activity';
    case 'morning_after':
      return '/morning-after' as Href;
    case 'daily_nudge_first':
    case 'daily_nudge_second':
      return '/check-in';
    case 'weekend_rally':
    case 'plan_invite':
    case 'plan_down':
      return '/messages?tab=plans' as Href;

    case 'friend_arrived':
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

/** Serialize registration and logout so a late registration cannot reattach a
 * signed-out account. Permission and successful server registration are separate. */
let operations: Promise<unknown> = Promise.resolve();
let loggingOut = false;
const deviceKey = 'spotted.push.device.v1';
async function bounded<T>(request: { abortSignal: (signal: AbortSignal) => PromiseLike<T> }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try { return await request.abortSignal(controller.signal); }
  finally { clearTimeout(timer); }
}
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = operations.then(work);
  operations = next.catch(() => {});
  return next;
}
async function assertUser(userId: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId) throw new Error('Push session changed');
}

/** Resolves granted ONLY after the token is saved. Transport failures throw
 * so callers retry instead of confusing a network failure with denied permission. */
export function registerPushToken(userId: string, opts: { prompt: boolean; token?: string }): Promise<PushPermission> {
  if (loggingOut) return Promise.reject(new Error('Signing out'));
  return serial(async () => {
    if (loggingOut) throw new Error('Signing out');
    await assertUser(userId);
    let permission = await getPushPermission();
    if (permission === 'undetermined' && opts.prompt) {
      const { status } = await Notifications.requestPermissionsAsync();
      permission = status === 'granted' ? 'granted' : 'denied';
    }
    if (permission !== 'granted') return permission;
    const token = opts.token ?? (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token !== 'string' || !token) throw new Error('No device token');
    if (loggingOut) throw new Error('Signing out');
    await assertUser(userId);
    // Keep the token before the network write: even a timed-out response may
    // have committed and must be detached on logout.
    await AsyncStorage.setItem(deviceKey, JSON.stringify({ userId, token }));
    const detach = await bounded(supabase.rpc('clear_stale_push_token', { p_token: token, p_keep_user_id: userId }));
    if (detach.error) throw detach.error;
    if (loggingOut) throw new Error('Signing out');
    const saved = await bounded(supabase.from('profiles')
      .update({ push_token: token, apns_device_token: token, push_enabled: true })
      .eq('id', userId).select('id'));
    if (saved.error) throw saved.error;
    if (saved.data?.length !== 1) throw new Error('Device registration was not saved');
    return permission;
  });
}

/** Detach while authenticated, then sign out this device. On network failure
 * leave the session intact and show a retry message rather than falsely claim
 * that logout also stopped pushes. Other devices/web subscriptions are retained. */
export async function signOutWithPushCleanup(): Promise<void> {
  if (loggingOut) return;
  loggingOut = true;
  try {
    await serial(async () => {
      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      const uid = auth.session?.user.id;
      if (uid) {
        let token: string | undefined;
        const raw = await AsyncStorage.getItem(deviceKey);
        if (raw) {
          try { const saved = JSON.parse(raw); if (saved.userId === uid) token = saved.token; } catch { /* recover from native */ }
        }
        if (!token) {
          try { const native = (await Notifications.getDevicePushTokenAsync()).data; if (typeof native === 'string') token = native; } catch { /* check server below */ }
        }
        if (token) {
          const { error } = await bounded(supabase.from('profiles')
            .update({ apns_device_token: null, push_token: null })
            .eq('id', uid).eq('apns_device_token', token));
          if (error) throw error;
        } else {
          const { data, error } = await bounded(supabase.from('profiles').select('apns_device_token').eq('id', uid));
          if (error || data?.[0]?.apns_device_token) throw new Error('Cannot verify notification cleanup');
        }
      }
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      await AsyncStorage.removeItem(deviceKey);
      await Promise.allSettled([
        Notifications.dismissAllNotificationsAsync(),
        Notifications.cancelAllScheduledNotificationsAsync(),
        Notifications.clearLastNotificationResponseAsync(),
        Notifications.setBadgeCountAsync(0),
      ]);
    });
  } catch {
    Alert.alert('Could not log out', 'Connect to the internet and try again so we can stop notifications for this account on this phone.');
  } finally { loggingOut = false; }
}
