import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentLocation, findNearestVenue } from '@/lib/location-service';
import { useCheckIn } from '@/contexts/CheckInContext';

const DETECTION_DEBOUNCE_MS = 30000; // 30 seconds between checks
const DISMISS_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes after dismissal

interface DetectionState {
  lastCheckTime: number;
  isChecking: boolean;
}

const detectionState: DetectionState = {
  lastCheckTime: 0,
  isChecking: false,
};

// Check if venue was recently dismissed
function isVenueDismissed(venueId: string): boolean {
  const dismissedKey = `venue_arrival_dismissed_${venueId}`;
  const dismissedTime = localStorage.getItem(dismissedKey);
  if (!dismissedTime) return false;
  
  const elapsed = Date.now() - parseInt(dismissedTime, 10);
  return elapsed < DISMISS_COOLDOWN_MS;
}

export function dismissVenuePrompt(venueId: string) {
  const dismissedKey = `venue_arrival_dismissed_${venueId}`;
  localStorage.setItem(dismissedKey, Date.now().toString());
}

export function usePlanningVenueDetection() {
  const { user } = useAuth();
  const { showVenueArrival, setDetectedVenue } = useCheckIn();
  const hasCheckedRef = useRef(false);

  const checkForNearbyVenue = useCallback(async () => {
    if (!user?.id) return;
    
    // Debounce check
    const now = Date.now();
    if (now - detectionState.lastCheckTime < DETECTION_DEBOUNCE_MS) return;
    if (detectionState.isChecking) return;
    
    detectionState.isChecking = true;
    detectionState.lastCheckTime = now;

    try {
      // Check if user is in "planning" status
      const { data: nightStatus } = await supabase
        .from('night_statuses')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (nightStatus?.status !== 'planning') {
        detectionState.isChecking = false;
        return;
      }

      // Get current location
      const location = await getCurrentLocation();
      
      // Find nearest venue within 200m
      const nearestVenue = await findNearestVenue(location.lat, location.lng, 200);
      
      if (nearestVenue && !isVenueDismissed(nearestVenue.id)) {
        // Show the arrival prompt
        setDetectedVenue({
          id: nearestVenue.id,
          name: nearestVenue.name,
          lat: location.lat,
          lng: location.lng,
        });
        showVenueArrival();
      }
    } catch (error) {
      console.error('Planning venue detection error:', error);
    } finally {
      detectionState.isChecking = false;
    }
  }, [user?.id, showVenueArrival, setDetectedVenue]);

  useEffect(() => {
    // Only run once per mount, with debounce protection
    if (!hasCheckedRef.current && user?.id) {
      hasCheckedRef.current = true;
      // Small delay to let the page load first
      const timer = setTimeout(checkForNearbyVenue, 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkForNearbyVenue]);

  return { checkForNearbyVenue };
}
