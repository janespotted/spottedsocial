/**
 * Browser notification utilities for reminder system.
 * Gracefully handles native Capacitor environment where
 * window.Notification does not exist.
 */
import { isNativePlatform } from '@/lib/platform';

export const requestNotificationPermission = async (): Promise<boolean> => {
  // On native, push permissions are handled by @capacitor/push-notifications
  if (isNativePlatform()) return false;

  if (!('Notification' in window)) {
    console.log('Browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export const showBrowserNotification = (title: string, body: string) => {
  if (isNativePlatform()) return;
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'checkin-reminder',
      requireInteraction: true,
    });
  }
};
