import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

const NOTIF_ID = 9999;
const STORAGE_KEY = 'morning_after_notif_scheduled';
export const MORNING_AFTER_FLAG = 'morning_after_open_recap';

/**
 * Schedule a local notification for 10am the next morning.
 * "Last night looked fun. Wanna see your recap?"
 *
 * Only schedules once per calendar night (idempotent).
 * Tapping the notification sets a localStorage flag that Layout
 * picks up to auto-open the Morning After modal.
 */
export async function scheduleMorningAfterNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // Only schedule once per night
  const today = new Date().toDateString();
  if (localStorage.getItem(STORAGE_KEY) === today) return;

  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') {
      const { display: newPerm } = await LocalNotifications.requestPermissions();
      if (newPerm !== 'granted') return;
    }

    // Calculate next 10am
    const now = new Date();
    const tenAm = new Date(now);
    tenAm.setHours(10, 0, 0, 0);
    // If it's already past 10am, schedule for tomorrow 10am
    if (now.getTime() >= tenAm.getTime()) {
      tenAm.setDate(tenAm.getDate() + 1);
    }

    // Cancel any previously scheduled morning-after notification
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] }).catch(() => {});

    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIF_ID,
          title: 'Spotted',
          body: "Last night looked fun. Wanna see your recap?",
          schedule: { at: tenAm },
          extra: { action: 'morning_after_recap' },
        },
      ],
    });

    // Listen for tap on this notification
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      if (notification.notification.extra?.action === 'morning_after_recap') {
        localStorage.setItem(MORNING_AFTER_FLAG, 'true');
      }
    });

    localStorage.setItem(STORAGE_KEY, today);
  } catch (e) {
    console.error('[MorningAfterNotif] schedule error:', e);
  }
}
