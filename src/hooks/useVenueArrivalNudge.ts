import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentLocation, findNearestVenue } from '@/lib/location-service';
import {
  canTrigger,
  canTriggerToast,
  isVenueDismissed,
  markCheckingStart,
  markCheckingEnd,
  markToastShown,
  resetDwellTracker,
  createModalDelivery,
} from '@/lib/venue-arrival-nudge';
import type { NudgeTriggerContext, ToastTriggerContext } from '@/lib/venue-arrival-nudge';
import { showVenueArrivalToast } from '@/components/VenueArrivalToast';

// Re-export for consumers that need to dismiss venues
export { dismissVenuePrompt } from '@/lib/venue-arrival-nudge';

export function useVenueArrivalNudge() {
  const { user } = useAuth();
  const { showVenueArrival, setDetectedVenue } = useCheckIn();
  const hasCheckedRef = useRef(false);
  const [isOutStatus, setIsOutStatus] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Create modal delivery handler
  const deliveryHandler = createModalDelivery(setDetectedVenue, showVenueArrival);

  // Silent venue update for toast flow (updates venue without changing status)
  const silentVenueUpdate = useCallback(async (userId: string, venue: { id: string; name: string }, lat: number, lng: number) => {
    const now = new Date().toISOString();
    
    try {
      // End existing check-ins
      await supabase
        .from('checkins')
        .update({ ended_at: now })
        .eq('user_id', userId)
        .is('ended_at', null);

      // Create new check-in
      await supabase
        .from('checkins')
        .insert({
          user_id: userId,
          venue_id: venue.id,
          venue_name: venue.name,
          lat,
          lng,
          started_at: now,
        });

      // Update night status venue (status stays 'out')
      await supabase
        .from('night_statuses')
        .update({
          venue_id: venue.id,
          venue_name: venue.name,
          lat,
          lng,
          updated_at: now,
        })
        .eq('user_id', userId);

      // Update profile location
      await supabase
        .from('profiles')
        .update({
          last_known_lat: lat,
          last_known_lng: lng,
          last_location_at: now,
        })
        .eq('id', userId);

      console.log('[VenueArrivalNudge] Silent venue update:', venue.name);
    } catch (error) {
      console.error('[VenueArrivalNudge] Silent update error:', error);
    }
  }, []);

  // Handler to open audience selector (placeholder - integrate with your audience sheet)
  const handleChangeAudience = useCallback(() => {
    // TODO: Open the audience selector sheet/modal
    console.log('[VenueArrivalNudge] Change audience requested');
  }, []);

  const checkForNearbyVenue = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch user's current status AND location_sharing_level in parallel
      const [{ data: nightStatus }, { data: profile }] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('status, venue_id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('location_sharing_level')
          .eq('id', user.id)
          .single(),
      ]);

      // Track if user is out for polling setup
      setIsOutStatus(nightStatus?.status === 'out');

      // Get location WITH accuracy
      const location = await getCurrentLocation();
      const nearestVenue = await findNearestVenue(location.lat, location.lng, 200);

      // No venue nearby - reset dwell tracker
      if (!nearestVenue) {
        resetDwellTracker();
        console.log('[VenueArrivalNudge] No venue within range');
        return;
      }

      // BRANCH: User is already "out" → Toast flow
      if (nightStatus?.status === 'out') {
        const toastContext: ToastTriggerContext = {
          userId: user.id,
          status: nightStatus.status,
          currentVenueId: nightStatus.venue_id ?? null,
          detectedVenueId: nearestVenue.id,
          gpsAccuracy: location.accuracy,
          locationSharingLevel: profile?.location_sharing_level ?? 'all_friends',
        };

        const decision = canTriggerToast(toastContext);
        if (!decision.shouldNudge) {
          console.log('[VenueArrivalNudge] Toast blocked:', decision.reason);
          return;
        }

        // Mark toast as shown BEFORE delivering
        markToastShown(nearestVenue.id);

        // Deliver via toast
        showVenueArrivalToast({
          venueName: nearestVenue.name,
          venueId: nearestVenue.id,
          locationSharingLevel: profile?.location_sharing_level ?? 'all_friends',
          onChangeAudience: handleChangeAudience,
        });

        // Silent venue update in background
        await silentVenueUpdate(user.id, nearestVenue, location.lat, location.lng);
        return;
      }

      // EXISTING: User is planning/no-status → Modal flow
      const context: NudgeTriggerContext = {
        userId: user.id,
        status: nightStatus?.status ?? null,
        currentVenueId: nightStatus?.venue_id ?? undefined,
      };

      // Check trigger conditions for modal
      const decision = canTrigger(context);
      if (!decision.shouldNudge) {
        console.log('[VenueArrivalNudge] Modal blocked:', decision.reason);
        return;
      }

      markCheckingStart();

      // Check venue-specific cooldown
      if (isVenueDismissed(nearestVenue.id)) {
        console.log('[VenueArrivalNudge] Venue dismissed recently:', nearestVenue.name);
        return;
      }

      // Deliver the nudge via modal
      deliveryHandler.deliver({
        id: nearestVenue.id,
        name: nearestVenue.name,
        lat: location.lat,
        lng: location.lng,
        distance: nearestVenue.distance,
      });
    } catch (error) {
      console.error('[VenueArrivalNudge] Detection error:', error);
    } finally {
      markCheckingEnd();
    }
  }, [user?.id, deliveryHandler, silentVenueUpdate, handleChangeAudience]);

  // Initial check on mount
  useEffect(() => {
    if (!hasCheckedRef.current && user?.id) {
      hasCheckedRef.current = true;
      const timer = setTimeout(checkForNearbyVenue, 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkForNearbyVenue]);

  // Continuous polling when user is "out" (for dwell time tracking)
  useEffect(() => {
    if (isOutStatus && user?.id) {
      // Poll every 15 seconds when out to detect venue changes + build dwell time
      pollingIntervalRef.current = setInterval(checkForNearbyVenue, 15000);
      console.log('[VenueArrivalNudge] Started polling for out status');
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          console.log('[VenueArrivalNudge] Stopped polling');
        }
      };
    }
  }, [isOutStatus, user?.id, checkForNearbyVenue]);

  return { checkForNearbyVenue };
}
