import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentLocation, findNearestVenue } from '@/lib/location-service';
import {
  canTrigger,
  isVenueDismissed,
  markCheckingStart,
  markCheckingEnd,
  createModalDelivery,
} from '@/lib/venue-arrival-nudge';
import type { NudgeTriggerContext } from '@/lib/venue-arrival-nudge';

// Re-export for consumers that need to dismiss venues
export { dismissVenuePrompt } from '@/lib/venue-arrival-nudge';

export function useVenueArrivalNudge() {
  const { user } = useAuth();
  const { showVenueArrival, setDetectedVenue } = useCheckIn();
  const hasCheckedRef = useRef(false);

  // Create modal delivery handler
  const deliveryHandler = createModalDelivery(setDetectedVenue, showVenueArrival);

  const checkForNearbyVenue = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch user's current status
      const { data: nightStatus } = await supabase
        .from('night_statuses')
        .select('status, venue_id')
        .eq('user_id', user.id)
        .maybeSingle();

      const context: NudgeTriggerContext = {
        userId: user.id,
        status: nightStatus?.status ?? null,
        currentVenueId: nightStatus?.venue_id ?? undefined,
      };

      // Check trigger conditions
      const decision = canTrigger(context);
      if (!decision.shouldNudge) {
        console.log('[VenueArrivalNudge] Blocked:', decision.reason);
        return;
      }

      markCheckingStart();

      // Get location and find venue
      const location = await getCurrentLocation();
      const nearestVenue = await findNearestVenue(location.lat, location.lng, 200);

      if (!nearestVenue) {
        console.log('[VenueArrivalNudge] No venue within range');
        return;
      }

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
  }, [user?.id, deliveryHandler]);

  useEffect(() => {
    if (!hasCheckedRef.current && user?.id) {
      hasCheckedRef.current = true;
      const timer = setTimeout(checkForNearbyVenue, 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkForNearbyVenue]);

  return { checkForNearbyVenue };
}
