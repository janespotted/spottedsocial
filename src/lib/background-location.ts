import { Capacitor, registerPlugin } from '@capacitor/core';
import { autoTrackVenue } from './auto-venue-tracker';
import { supabase } from '@/integrations/supabase/client';
import { findNearestVenue, calculateDistance } from './location-service';
import { triggerPushNotification } from './push-notifications';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>(
  'BackgroundGeolocation'
);

let watcherId: string | null = null;

// Track the last venue we sent a planning nudge for, to avoid repeat notifications
let lastNudgedVenueId: string | null = null;
let lastNudgedVenueLat: number | null = null;
let lastNudgedVenueLng: number | null = null;

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

        // If user is 'planning', nudge them when they arrive at a venue
        try {
          console.log('[BgLocation:PlanningNudge] Starting check. lastNudgedVenueId:', lastNudgedVenueId);

          // Reset nudge tracking if user moved >500m from the last nudged venue
          if (lastNudgedVenueId && lastNudgedVenueLat != null && lastNudgedVenueLng != null) {
            const distFromNudged = calculateDistance(
              lastNudgedVenueLat, lastNudgedVenueLng,
              location.latitude, location.longitude
            );
            console.log('[BgLocation:PlanningNudge] Distance from last nudged venue:', Math.round(distFromNudged), 'm');
            if (distFromNudged > 500) {
              console.log('[BgLocation:PlanningNudge] >500m — resetting nudge tracking');
              lastNudgedVenueId = null;
              lastNudgedVenueLat = null;
              lastNudgedVenueLng = null;
            }
          }

          const { data: nightStatus, error: nightStatusError } = await supabase
            .from('night_statuses')
            .select('status')
            .eq('user_id', userId)
            .single();

          console.log('[BgLocation:PlanningNudge] night_status query result:', nightStatus?.status ?? 'null', 'error:', nightStatusError?.message ?? 'none');

          if (nightStatus?.status === 'planning') {
            console.log('[BgLocation:PlanningNudge] User is planning — searching for venue within 200m at', location.latitude.toFixed(5), location.longitude.toFixed(5));
            const nearestVenue = await findNearestVenue(location.latitude, location.longitude, 200);

            if (!nearestVenue) {
              console.log('[BgLocation:PlanningNudge] No venue found within 200m — skipping');
            } else if (nearestVenue.id === lastNudgedVenueId) {
              console.log('[BgLocation:PlanningNudge] Same venue as last nudge:', nearestVenue.name, '(', nearestVenue.id, ') — skipping');
            } else {
              console.log('[BgLocation:PlanningNudge] New venue detected:', nearestVenue.name, '(', nearestVenue.id, ') — sending push');
              lastNudgedVenueId = nearestVenue.id;
              lastNudgedVenueLat = location.latitude;
              lastNudgedVenueLng = location.longitude;

              // Store venue data so the notification tap handler can read it
              localStorage.setItem('venue_arrival_planning_payload', JSON.stringify({
                venue_id: nearestVenue.id,
                venue_name: nearestVenue.name,
              }));

              const notificationId = `venue_arrival_planning_${userId}_${nearestVenue.id}_${Date.now()}`;
              console.log('[BgLocation:PlanningNudge] Calling triggerPushNotification with id:', notificationId);
              triggerPushNotification({
                id: notificationId,
                receiver_id: userId,
                sender_id: userId,
                type: 'venue_arrival_planning',
                message: `Looks like you're at ${nearestVenue.name} — let your friends know you're out? 🎉`,
              });

              console.log('[BgLocation:PlanningNudge] Push triggered for venue:', nearestVenue.name);
            }
          } else {
            console.log('[BgLocation:PlanningNudge] User status is not planning — skipping');
          }
        } catch (err) {
          console.error('[BgLocation:PlanningNudge] Error:', err);
        }

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
