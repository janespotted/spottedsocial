import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { autoTrackVenue } from '@/lib/auto-venue-tracker';

/**
 * Hook to trigger auto-venue tracking on component mount
 * Use this on major screens: Map, Feed, Chat, Profile
 * Includes ref guard to prevent duplicate calls during component lifecycle
 */
export const useAutoVenueTracking = () => {
  const { user } = useAuth();
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (!user || hasTrackedRef.current) return;
    hasTrackedRef.current = true;

    // Trigger auto-tracking when component mounts (user navigates to screen)
    const track = async () => {
      await autoTrackVenue(user.id);
    };

    track();

    return () => {
      // Reset on unmount so tracking works again on remount
      hasTrackedRef.current = false;
    };
  }, [user]);
};
