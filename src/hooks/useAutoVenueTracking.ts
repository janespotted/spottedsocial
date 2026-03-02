import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { autoTrackVenue } from '@/lib/auto-venue-tracker';
import { supabase } from '@/integrations/supabase/client';

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

  // 60-second heartbeat: update GPS + timestamps while user is "out"
  useEffect(() => {
    if (!user) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const heartbeat = async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        );
        const now = new Date().toISOString();
        await Promise.all([
          supabase.from('profiles').update({
            last_known_lat: pos.coords.latitude,
            last_known_lng: pos.coords.longitude,
            last_location_at: now,
          }).eq('id', user.id),
          supabase.from('checkins').update({
            last_updated_at: now,
          }).eq('user_id', user.id).is('ended_at', null),
        ]);
      } catch {
        /* GPS unavailable, skip */
      }
    };

    const start = async () => {
      // Check if user is currently "out"
      const { data } = await supabase
        .from('night_statuses')
        .select('status')
        .eq('user_id', user.id)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (cancelled || data?.status !== 'out') return;
      heartbeat(); // immediate first tick
      intervalId = setInterval(heartbeat, 60000);
    };

    start();

    // Pause heartbeat when hidden, resume on foreground return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Foreground return: fire heartbeat immediately + trigger auto-track
        if (!cancelled && intervalId) {
          heartbeat();
        }
        autoTrackVenue(user.id);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user]);
};
