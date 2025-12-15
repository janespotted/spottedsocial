import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { useInputFocus } from '@/contexts/InputFocusContext';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentLocation, findNearestVenue, calculateDistance } from '@/lib/location-service';
import {
  canTriggerVenueArrival,
  isVenueDismissed,
  markCheckingStart,
  markCheckingEnd,
  markToastShown,
  resetDwellTracker,
  createModalDelivery,
  recordDeparture,
  updatePreviousVenue,
  getPreviousVenueId,
  suppressVenueTonight,
} from '@/lib/venue-arrival-nudge';
import type { VenueArrivalContext, NightStatus } from '@/lib/venue-arrival-nudge';
import { showVenueArrivalToast } from '@/components/VenueArrivalToast';

// Re-export for consumers that need to dismiss venues
export { dismissVenuePrompt, suppressVenueTonight } from '@/lib/venue-arrival-nudge';

// Store venue locations for departure detection
interface VenueLocation {
  id: string;
  lat: number;
  lng: number;
}

let knownVenues: Map<string, VenueLocation> = new Map();

export function useVenueArrivalNudge() {
  const { user } = useAuth();
  const { showVenueArrival, setDetectedVenue } = useCheckIn();
  const { isInputFocusedRef } = useInputFocus();
  const hasCheckedRef = useRef(false);
  const [isOutStatus, setIsOutStatus] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Create modal delivery handler
  const deliveryHandler = createModalDelivery(setDetectedVenue, showVenueArrival);

  // Silent venue update for toast flow (updates venue without changing status)
  const silentVenueUpdate = useCallback(async (
    userId: string, 
    venue: { id: string; name: string }, 
    lat: number, 
    lng: number
  ) => {
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

  // Handler to open audience selector
  const handleChangeAudience = useCallback(() => {
    console.log('[VenueArrivalNudge] Change audience requested');
  }, []);

  const checkForNearbyVenue = useCallback(async () => {
    if (!user?.id) return;
    
    // Skip polling when user is typing to prevent jitter
    if (isInputFocusedRef.current) {
      console.log('[VenueArrivalNudge] Skipping - input focused');
      return;
    }

    try {
      // Fetch user's current status AND location_sharing_level in parallel
      const [{ data: nightStatus }, { data: profile }] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('status, venue_id, lat, lng')
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

      // Get location WITH accuracy AND timestamp
      const location = await getCurrentLocation();
      
      // Check for departure from previous venue
      const prevVenueId = getPreviousVenueId();
      if (prevVenueId && knownVenues.has(prevVenueId)) {
        const prevVenue = knownVenues.get(prevVenueId)!;
        const distanceFromPrevVenue = calculateDistance(
          location.lat, 
          location.lng, 
          prevVenue.lat, 
          prevVenue.lng
        );
        
        // If moved significantly away from previous venue, record departure
        if (distanceFromPrevVenue > 300) {
          recordDeparture(prevVenueId, distanceFromPrevVenue);
          console.log('[VenueArrivalNudge] Departure recorded:', prevVenueId, Math.round(distanceFromPrevVenue), 'm');
        }
      }

      // Find nearest venue
      const nearestVenue = await findNearestVenue(location.lat, location.lng, 500);

      // No venue within max detection range - reset dwell tracker
      if (!nearestVenue) {
        resetDwellTracker();
        updatePreviousVenue(null);
        console.log('[VenueArrivalNudge] No venue within 500m');
        return;
      }

      // Store venue location for future departure detection
      knownVenues.set(nearestVenue.id, {
        id: nearestVenue.id,
        lat: location.lat, // Approximate using user's location
        lng: location.lng,
      });

      // Build unified context
      const context: VenueArrivalContext = {
        userId: user.id,
        status: (nightStatus?.status as NightStatus) ?? null,
        currentVenueId: nightStatus?.venue_id ?? null,
        detectedVenueId: nearestVenue.id,
        distance: nearestVenue.distance,
        gpsAccuracy: location.accuracy,
        locationSharingLevel: profile?.location_sharing_level ?? 'all_friends',
        lat: location.lat,
        lng: location.lng,
        timestamp: location.timestamp,
      };

      // Single unified trigger check
      const decision = canTriggerVenueArrival(context);
      
      if (!decision.shouldNudge) {
        console.log('[VenueArrivalNudge] Blocked:', decision.reason);
        return;
      }

      console.log('[VenueArrivalNudge] Triggering:', decision.deliveryMethod, 'for', nearestVenue.name);
      markCheckingStart();

      // Update previous venue tracking
      updatePreviousVenue(nearestVenue.id);

      if (decision.deliveryMethod === 'toast') {
        // Toast flow for "out" users
        markToastShown(nearestVenue.id);

        showVenueArrivalToast({
          venueName: nearestVenue.name,
          venueId: nearestVenue.id,
          locationSharingLevel: profile?.location_sharing_level ?? 'all_friends',
          onChangeAudience: handleChangeAudience,
        });

        // Silent venue update in background
        await silentVenueUpdate(user.id, nearestVenue, location.lat, location.lng);
      } else {
        // Modal flow for planning/no-status users
        if (isVenueDismissed(nearestVenue.id)) {
          console.log('[VenueArrivalNudge] Venue dismissed recently:', nearestVenue.name);
          return;
        }

        deliveryHandler.deliver({
          id: nearestVenue.id,
          name: nearestVenue.name,
          lat: location.lat,
          lng: location.lng,
          distance: nearestVenue.distance,
        });
      }
    } catch (error) {
      console.error('[VenueArrivalNudge] Detection error:', error);
    } finally {
      markCheckingEnd();
    }
  }, [user?.id, deliveryHandler, silentVenueUpdate, handleChangeAudience, isInputFocusedRef]);

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
