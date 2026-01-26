import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { autoTrackVenue } from '@/lib/auto-venue-tracker';

// Global tracking state to prevent duplicate calls across all hook instances
let lastGlobalTrackTime = 0;
const GLOBAL_DEBOUNCE_MS = 30000;

/**
 * Hook to trigger auto-venue tracking on component mount
 * Use this on major screens: Map, Feed, Chat, Profile
 * Uses global debounce to prevent duplicate calls across component lifecycles
 */
export const useAutoVenueTracking = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    
    // Global debounce check - prevents all duplicate calls within 30s
    const now = Date.now();
    if (now - lastGlobalTrackTime < GLOBAL_DEBOUNCE_MS) {
      return;
    }
    lastGlobalTrackTime = now;

    // Trigger auto-tracking when component mounts (user navigates to screen)
    autoTrackVenue(user.id);
  }, [user]);
};
