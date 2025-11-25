import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { autoTrackVenue } from '@/lib/auto-venue-tracker';

/**
 * Hook to trigger auto-venue tracking on component mount
 * Use this on major screens: Map, Feed, Chat, Profile
 */
export const useAutoVenueTracking = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Trigger auto-tracking when component mounts (user navigates to screen)
    const track = async () => {
      await autoTrackVenue(user.id);
    };

    track();
  }, [user]);
};
