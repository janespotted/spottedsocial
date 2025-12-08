import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/lib/logger';
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

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isSupported = typeof window !== 'undefined' && 
    'serviceWorker' in navigator && 
    'PushManager' in window &&
    'Notification' in window;

  // Check current subscription status
  const checkSubscription = useCallback(async () => {
    if (!isSupported || !user) {
      setIsLoading(false);
      return;
    }

    try {
      setPermission(Notification.permission);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      setIsSubscribed(!!subscription);
      logger.info('push:check_subscription', { isSubscribed: !!subscription });
    } catch (error) {
      logger.error('push:check_error', { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Register service worker on mount
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        logger.info('push:sw_registered', { scope: registration.scope });
      })
      .catch((error) => {
        logger.error('push:sw_register_error', { error: String(error) });
      });
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user || !VAPID_PUBLIC_KEY) {
      logger.warn('push:subscribe_failed', { 
        reason: !isSupported ? 'not_supported' : !user ? 'no_user' : 'no_vapid_key' 
      });
      return false;
    }

    try {
      setIsLoading(true);

      // Request permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        logger.info('push:permission_denied');
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Convert subscription to JSON-compatible format
      const subscriptionJson = subscription.toJSON() as unknown as Json;

      // Save subscription to database
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
  }, [isSupported, user]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) return false;

    try {
      setIsLoading(true);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remove subscription from database
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
  }, [isSupported, user]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
