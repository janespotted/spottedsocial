import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { setDemoMode } from '@/lib/demo-data';
import { cacheCity } from '@/lib/city-detection';
import type { SupportedCity } from '@/lib/city-detection';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { goOutAtVenue } from '@/lib/night-status';
import { captureLocationWithVenue } from '@/lib/location-service';

const PENDING_DEMO_KEY = 'pending_demo_activation';
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PendingDemoActivation {
  city: SupportedCity;
  timestamp: number;
}

// Featured venues per city for auto check-in
const FEATURED_VENUES: Record<SupportedCity, { name: string; lat: number; lng: number }> = {
  nyc: { name: 'Le Bain', lat: 40.7414, lng: -74.0078 },
  la: { name: 'Sound Nightclub', lat: 34.0412, lng: -118.2468 },
  pb: { name: 'Cucina', lat: 26.7056, lng: -80.0364 }
};

export function DemoActivator() {
  const { user, loading } = useAuth();
  const hasActivated = useRef(false);

  // Step 1: Detect URL params on mount (before auth)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demoParam = params.get('demo');
    const cityParam = params.get('city') as SupportedCity | null;

    if (demoParam === 'yc' || demoParam === 'true') {
      const activation: PendingDemoActivation = {
        city: cityParam || 'nyc',
        timestamp: Date.now()
      };
      
      localStorage.setItem(PENDING_DEMO_KEY, JSON.stringify(activation));
      logger.debug('demo:url-detected', { city: activation.city });
      
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Step 2: Activate demo after auth
  useEffect(() => {
    if (loading || !user || hasActivated.current) return;

    const stored = localStorage.getItem(PENDING_DEMO_KEY);
    if (!stored) return;

    try {
      const pending: PendingDemoActivation = JSON.parse(stored);
      
      // Check if expired
      if (Date.now() - pending.timestamp > EXPIRY_MS) {
        localStorage.removeItem(PENDING_DEMO_KEY);
        logger.debug('demo:activation-expired');
        return;
      }

      hasActivated.current = true;
      activateDemo(pending.city, user.id);
    } catch (e) {
      localStorage.removeItem(PENDING_DEMO_KEY);
    }
  }, [user, loading]);

  return null;
}

async function activateDemo(city: SupportedCity, userId: string) {
  try {
    logger.debug('demo:activating', { city, userId });

    // Set city before seeding (needed for venue lookups)
    cacheCity(city);

    // Seed data via edge function — do NOT enable demo mode until this succeeds
    const { data, error } = await supabase.functions.invoke('seed-demo-data', {
      body: { action: 'seed', city, userId }
    });

    if (error) {
      // Extract structured details from the error
      const context = (error as any)?.context;
      const status = context?.status || 'unknown';
      const errorBody = typeof data === 'object' ? data : { raw: data };
      logger.error('demo:seed-error', { status, error: error.message, ...errorBody });
      toast.error(`Demo seed failed (${status})`, {
        description: errorBody?.error || error.message,
      });
      return;
    }

    // Seeding succeeded — now enable demo mode
    setDemoMode(true);

    // Try real GPS first for venue detection
    let venueName: string | null = null;
    try {
      const locData = await captureLocationWithVenue();
      if (locData.venueId && locData.venueName) {
        logger.debug('demo:gps-venue-found', { venue: locData.venueName, accuracy: locData.accuracy });
        venueName = await simulateCheckinForDemo(userId, city, {
          name: locData.venueName,
          lat: locData.lat,
          lng: locData.lng,
        });
      }
    } catch (e) {
      logger.debug('demo:gps-failed-using-fallback', { error: String(e) });
    }

    // Fallback to featured venue if GPS didn't work
    if (!venueName) {
      const venue = FEATURED_VENUES[city];
      venueName = await simulateCheckinForDemo(userId, city, venue);
    }
    // Clear pending activation
    localStorage.removeItem(PENDING_DEMO_KEY);

    // Dispatch event to notify other components
    window.dispatchEvent(new Event('demoModeChanged'));

    // Show success toast with venue info
    const cityName = city === 'nyc' ? 'NYC' : city === 'la' ? 'LA' : 'Palm Beach';
    if (venueName) {
      toast.success(`Welcome to Spotted! You're "at" ${venueName} in ${cityName} 🎉`, {
        description: 'Explore the map, check the leaderboard, and yap about the vibes!'
      });
    } else {
      toast.success(`Welcome! Demo mode activated with ${cityName} nightlife data 🎉`);
    }

    logger.debug('demo:activated', { city, venueName });
  } catch (e) {
    logger.error('demo:activation-failed', { error: String(e) });
    toast.error('Failed to activate demo mode');
  }
}

async function simulateCheckinForDemo(
  userId: string,
  _city: SupportedCity,
  venue: { name: string; lat: number; lng: number }
): Promise<string | null> {
  try {
    // Never clobber real state: skip if user has any current unexpired status or open checkin
    const { data: existingStatus } = await supabase
      .from('night_statuses')
      .select('status')
      .eq('user_id', userId)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingStatus) {
      logger.debug('demo:skip-checkin-existing-status', { status: existingStatus.status });
      return null;
    }

    const { data: openCheckin } = await supabase
      .from('checkins')
      .select('id')
      .eq('user_id', userId)
      .is('ended_at', null)
      .limit(1)
      .maybeSingle();

    if (openCheckin) {
      logger.debug('demo:skip-checkin-open-checkin');
      return null;
    }

    // Resolve venue ID
    let resolvedVenue: { id: string; name: string } | null = null;

    const { data: venueData, error: venueError } = await supabase
      .from('venues')
      .select('id, name')
      .eq('name', venue.name)
      .maybeSingle();

    if (venueError || !venueData) {
      logger.warn('demo:venue-not-found', { venueName: venue.name, error: venueError?.message });
      return null;
    }
    resolvedVenue = venueData;

    // Route through WP2 helper so all three stores (NS, checkin, profile) agree
    await goOutAtVenue(userId, {
      venue: { id: resolvedVenue.id, name: resolvedVenue.name },
      coords: { lat: venue.lat, lng: venue.lng },
      source: 'demo',
    });

    // Record that we simulated a check-in so demo clear can undo it
    localStorage.setItem('demo_simulated_checkin', 'true');

    logger.debug('demo:checkin-simulated', { userId, venue: resolvedVenue.name });
    return resolvedVenue.name;
  } catch (e) {
    logger.error('demo:checkin-failed', { error: String(e) });
    return null;
  }
}
