import { Capacitor, registerPlugin } from '@capacitor/core';
import { autoTrackVenue } from './auto-venue-tracker';
import { supabase } from '@/integrations/supabase/client';
import { findNearestVenue, findNearbyVenues, calculateDistance } from './location-service';
import { triggerPushNotification } from './push-notifications';
import { checkFriendsOutWithoutYou, sendWeekendPregameNudge, checkTopVenueTonight } from './fomo-notifications';
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
          } else if (!nightStatus || nightStatusError) {
            // User has NO night status — not checked in at all
            // Nudge them if they're near a venue
            console.log('[BgLocation:PassiveNudge] User has no night status — checking nearby venues');
            const nearestVenue = await findNearestVenue(location.latitude, location.longitude, 150);

            if (nearestVenue && nearestVenue.id !== lastNudgedVenueId) {
              // Only nudge once per venue per session, and max once per hour
              const nudgeKey = `passive_venue_nudge_${nearestVenue.id}`;
              const lastNudge = localStorage.getItem(nudgeKey);
              const oneHourAgo = Date.now() - 60 * 60 * 1000;

              if (!lastNudge || parseInt(lastNudge) < oneHourAgo) {
                console.log('[BgLocation:PassiveNudge] Sending nudge for venue:', nearestVenue.name);
                lastNudgedVenueId = nearestVenue.id;
                lastNudgedVenueLat = location.latitude;
                lastNudgedVenueLng = location.longitude;
                localStorage.setItem(nudgeKey, String(Date.now()));

                // Store venue data for tap handler
                localStorage.setItem('venue_arrival_planning_payload', JSON.stringify({
                  venue_id: nearestVenue.id,
                  venue_name: nearestVenue.name,
                }));
                localStorage.setItem('venue_arrival_planning_open', 'true');

                triggerPushNotification({
                  id: `passive_venue_nudge_${userId}_${nearestVenue.id}_${Date.now()}`,
                  receiver_id: userId,
                  sender_id: userId,
                  type: 'venue_arrival_planning',
                  message: `Looking like you're at ${nearestVenue.name}. Wanna show you're out to friends?`,
                });
              } else {
                console.log('[BgLocation:PassiveNudge] Already nudged for', nearestVenue.name, 'within the hour — skipping');
              }
            }
          } else {
            console.log('[BgLocation:PlanningNudge] User status is', nightStatus?.status, '— skipping');
          }
        } catch (err) {
          console.error('[BgLocation:PlanningNudge] Error:', err);
        }

        // ── Friends nearby notification ──
        // If friends are checked in at a venue within walking distance, notify
        try {
          const nearbyFriendsKey = 'nearby_friends_notif_last';
          const lastNotif = localStorage.getItem(nearbyFriendsKey);
          const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;

          if (!lastNotif || parseInt(lastNotif) < thirtyMinsAgo) {
            // Get friend IDs
            const [sentRes, recvRes] = await Promise.all([
              supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
              supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
            ]);
            const friendIds = [
              ...(sentRes.data?.map(f => f.friend_id) || []),
              ...(recvRes.data?.map(f => f.user_id) || []),
            ];

            if (friendIds.length > 0) {
              // Get nearby venues within ~800m (~10 min walk)
              const nearbyVenues = await findNearbyVenues(location.latitude, location.longitude, 800, 5);

              if (nearbyVenues.length > 0) {
                const venueIds = nearbyVenues.map(v => v.id);
                const venueMap = new Map(nearbyVenues.map(v => [v.id, v]));

                // Check which friends are checked in at those venues
                const { data: friendCheckins } = await supabase
                  .from('night_statuses')
                  .select('user_id, venue_id, venue_name')
                  .in('user_id', friendIds)
                  .in('venue_id', venueIds)
                  .eq('status', 'out')
                  .not('expires_at', 'is', null)
                  .gt('expires_at', new Date().toISOString());

                if (friendCheckins && friendCheckins.length > 0) {
                  // Group friends by venue
                  const venueGroups = new Map<string, { venueName: string; venueId: string; friendCount: number; distance: number }>();
                  for (const fc of friendCheckins) {
                    if (!fc.venue_id) continue;
                    const venue = venueMap.get(fc.venue_id);
                    if (!venue) continue;
                    const existing = venueGroups.get(fc.venue_id);
                    if (existing) {
                      existing.friendCount++;
                    } else {
                      venueGroups.set(fc.venue_id, {
                        venueName: fc.venue_name || venue.name,
                        venueId: fc.venue_id,
                        friendCount: 1,
                        distance: venue.distance,
                      });
                    }
                  }

                  // Pick the venue with the most friends
                  let best: { venueName: string; venueId: string; friendCount: number; distance: number } | null = null;
                  for (const group of venueGroups.values()) {
                    if (!best || group.friendCount > best.friendCount) best = group;
                  }

                  if (best && best.friendCount >= 1) {
                    // Calculate walk time (~80m per minute average walking speed)
                    const walkMins = Math.max(1, Math.round(best.distance / 80));
                    const friendLabel = best.friendCount === 1 ? '1 friend is' : `${best.friendCount} friends are`;

                    localStorage.setItem(nearbyFriendsKey, String(Date.now()));

                    triggerPushNotification({
                      id: `friends_nearby_${userId}_${best.venueId}_${Date.now()}`,
                      receiver_id: userId,
                      sender_id: userId,
                      type: 'friends_nearby',
                      message: `${friendLabel} out at ${best.venueName}. Just a ${walkMins} min walk from you.`,
                    });

                    console.log('[BgLocation:FriendsNearby] Notified:', best.friendCount, 'friends at', best.venueName, walkMins, 'min walk');
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('[BgLocation:FriendsNearby] Error:', err);
        }

        // FOMO notifications — fire-and-forget, rate-limited internally
        checkFriendsOutWithoutYou(userId).catch(() => {});
        sendWeekendPregameNudge(userId).catch(() => {});
        checkTopVenueTonight(userId, 'la').catch(() => {}); // TODO: use user's actual city

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
