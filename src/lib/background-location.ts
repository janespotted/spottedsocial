import { Capacitor, registerPlugin } from '@capacitor/core';
import { autoTrackVenue } from './auto-venue-tracker';
import { supabase } from '@/integrations/supabase/client';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  'BackgroundGeolocation'
);

let watcherId: string | null = null;

/**
 * Start background location tracking.
 * Only runs on native iOS/Android — no-op on web.
 * Feeds location updates into the existing auto-venue-tracker.
 */
export async function startBackgroundLocation(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (watcherId) return; // Already running

  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: 'Spotted is tracking your venue in the background.',
        backgroundTitle: 'Spotted Location',
        requestPermissions: true,
        stale: false,
        distanceFilter: 100, // Only fire when moved 100m+
      },
      async (location, error) => {
        if (error) {
          if (error?.code === 'NOT_AUTHORIZED') {
            console.log('[BgLocation] Not authorized for background location');
          }
          return;
        }

        if (!location) return;

        console.log('[BgLocation] Got update:', location.latitude.toFixed(4), location.longitude.toFixed(4));

        // Update profile GPS
        const now = new Date().toISOString();
        await supabase
          .from('profiles')
          .update({
            last_known_lat: location.latitude,
            last_known_lng: location.longitude,
            last_location_at: now,
          })
          .eq('id', userId);

        // Update active check-in timestamp
        await supabase
          .from('checkins')
          .update({ last_updated_at: now })
          .eq('user_id', userId)
          .is('ended_at', null);

        // Trigger the existing auto-venue-tracker to check for venue change
        autoTrackVenue(userId);
      }
    );

    console.log('[BgLocation] Watcher started:', watcherId);
  } catch (err) {
    console.error('[BgLocation] Failed to start:', err);
  }
}

/**
 * Stop background location tracking.
 */
export async function stopBackgroundLocation(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !watcherId) return;

  try {
    await BackgroundGeolocation.removeWatcher({ id: watcherId });
    watcherId = null;
    console.log('[BgLocation] Watcher stopped');
  } catch (err) {
    console.error('[BgLocation] Failed to stop:', err);
  }
}
