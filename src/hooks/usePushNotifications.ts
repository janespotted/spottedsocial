import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
import { isNativePlatform } from '@/lib/platform';
import type { Json } from '@/integrations/supabase/types';

interface UsePushNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  isLoading: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

// VAPID public key from environment
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function swReadyWithTimeout(ms = 3000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SW ready timeout')), ms)
    ),
  ]);
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

// ── Native (Capacitor) push helpers ──────────────────────────────────

async function subscribeNative(userId: string): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      logger.info('push:native_permission_denied', { receive: permResult.receive });
      return false;
    }

    // Add listeners BEFORE calling register to avoid missing the event
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        logger.error('push:registration_timeout');
        resolve(false);
      }, 10000);

      PushNotifications.addListener('registration', async (token) => {
        clearTimeout(timeout);
        logger.info('push:native_registered', { token: token.value.slice(0, 8) + '…' });

        const { error } = await supabase
          .from('profiles')
          .update({
            apns_device_token: token.value,
            push_enabled: true,
          })
          .eq('id', userId);

        if (error) {
          logger.apiError('push:save_apns_token', error);
          resolve(false);
        } else {
          resolve(true);
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timeout);
        logger.error('push:native_registration_error', { error: JSON.stringify(err) });
        resolve(false);
      });

      // Register AFTER listeners are in place
      PushNotifications.register();
    });
  } catch (error) {
    logger.error('push:native_subscribe_error', { error: String(error) });
    return false;
  }
}

async function unsubscribeNative(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        apns_device_token: null,
        push_enabled: false,
      })
      .eq('id', userId);

    if (error) {
      logger.apiError('push:remove_apns_token', error);
      return false;
    }
    return true;
  } catch (error) {
    logger.error('push:native_unsubscribe_error', { error: String(error) });
    return false;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const native = isNativePlatform();

  // Always report supported so the toggle is visible; handle errors at subscribe time
  const isSupported = true;

  // Check current subscription status
  const checkSubscription = useCallback(async () => {
    if (!isSupported || !user) {
      setIsLoading(false);
      return;
    }

    try {
      if (native) {
        // On native, check iOS permission status first — this is the source of truth
        let iosPermission: string = 'default';
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          const permStatus = await PushNotifications.checkPermissions();
          iosPermission = permStatus.receive;
          if (permStatus.receive === 'denied') {
            setPermission('denied');
            setIsSubscribed(false);
            return;
          }
          setPermission(permStatus.receive === 'granted' ? 'granted' : 'default');
        } catch {
          setPermission('default');
        }

        // If iOS permission is granted, the user has opted in.
        // The DB may not have push_enabled=true yet due to a race with
        // App.tsx auto-registration, so treat granted permission as subscribed.
        if (iosPermission === 'granted') {
          setIsSubscribed(true);

          // Ensure the DB reflects this — if push_enabled isn't true yet,
          // the auto-registration in App.tsx will set it shortly.
          const { data } = await supabase
            .from('profiles')
            .select('push_enabled')
            .eq('id', user.id)
            .single();

          if (data && !data.push_enabled) {
            // DB is stale — auto-registration hasn't saved yet, or
            // something cleared it. Set it now.
            await supabase
              .from('profiles')
              .update({ push_enabled: true })
              .eq('id', user.id);
          }
        } else {
          setIsSubscribed(false);
        }
      } else {
      setPermission(Notification.permission);
        try {
          const registration = await swReadyWithTimeout();
          const subscription = await (registration as any).pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        } catch {
          setIsSubscribed(false);
        }
      }
      logger.info('push:check_subscription', { isSubscribed, native });
    } catch (error) {
      logger.error('push:check_error', { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, native]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Register service worker on mount (web only)
  useEffect(() => {
    if (!isSupported || native) return;

    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        logger.info('push:sw_registered', { scope: registration.scope });
      })
      .catch((error) => {
        logger.error('push:sw_register_error', { error: String(error) });
      });
  }, [isSupported, native]);

  // Set up native push notification listeners
  useEffect(() => {
    if (!native) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        const received = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          logger.info('push:native_received', { title: notification.title });
        });

        const action = await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          logger.info('push:native_action', { actionId: notification.actionId });
          // Navigate based on notification data
          const url = (notification.notification.data as any)?.url;
          if (url) {
            window.history.pushState(null, '', url);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        });

        cleanup = () => {
          received.remove();
          action.remove();
        };
      } catch {}
    })();

    return () => cleanup?.();
  }, [native]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) {
      logger.warn('push:subscribe_failed', { reason: !isSupported ? 'not_supported' : 'no_user' });
      return false;
    }

    try {
      setIsLoading(true);

      if (native) {
        const success = await subscribeNative(user.id);
        if (success) {
          setIsSubscribed(true);
          setPermission('granted');
        }
        return success;
      }

      // Web push flow
      if (!VAPID_PUBLIC_KEY) {
        logger.warn('push:subscribe_failed', { reason: 'no_vapid_key' });
        return false;
      }

      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        logger.info('push:permission_denied');
        return false;
      }

      const registration = await swReadyWithTimeout(5000);
      const subscription = await (registration as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subscriptionJson = subscription.toJSON() as unknown as Json;

      const { error } = await supabase
        .from('profiles')
        .update({ 
          push_subscription: subscriptionJson,
          push_enabled: true,
        })
        .eq('id', user.id);

      if (error) {
        logger.apiError('push:save_subscription', error);
        return false;
      }

      setIsSubscribed(true);
      logger.info('push:subscribed', { userId: user.id });
      return true;
    } catch (error) {
      logger.error('push:subscribe_error', { error: String(error) });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, native]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) return false;

    try {
      setIsLoading(true);

      if (native) {
        const success = await unsubscribeNative(user.id);
        if (success) {
          setIsSubscribed(false);
          setPermission('default');
        }
        return success;
      }

      // Web push flow
      const registration = await swReadyWithTimeout(5000);
      const subscription = await (registration as any).pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      const { error } = await supabase
        .from('profiles')
        .update({ 
          push_subscription: null,
          push_enabled: false,
        })
        .eq('id', user.id);

      if (error) {
        logger.apiError('push:remove_subscription', error);
        return false;
      }

      setIsSubscribed(false);
      logger.info('push:unsubscribed', { userId: user.id });
      return true;
    } catch (error) {
      logger.error('push:unsubscribe_error', { error: String(error) });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, native]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
