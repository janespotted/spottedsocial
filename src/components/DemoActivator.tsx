import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { setDemoMode } from '@/lib/demo-data';
import { cacheCity } from '@/lib/city-detection';
import type { SupportedCity } from '@/lib/city-detection';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { calculateExpiryTime } from '@/lib/time-utils';

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

    // Enable demo mode
    setDemoMode(true);
    
    // Set city
    cacheCity(city);

    // Seed data via edge function
    const { error } = await supabase.functions.invoke('seed-demo-data', {
      body: { action: 'seed', city, userId }
    });

    if (error) {
      logger.error('demo:seed-error', { error: error.message });
      toast.error('Failed to load demo data');
      return;
    }

    // Auto check-in user at featured venue
    const venue = FEATURED_VENUES[city];
    const venueName = await simulateCheckinForDemo(userId, city, venue);

    // Clear pending activation
    localStorage.removeItem(PENDING_DEMO_KEY);

    // Dispatch event to notify other components
    window.dispatchEvent(new Event('demoModeChanged'));

    // Show success toast with venue info
    const cityName = city === 'nyc' ? 'NYC' : city === 'la' ? 'LA' : 'Palm Beach';
    if (venueName) {
      toast.success(`Welcome to Spotted! You're "at" ${venueName} in ${cityName} 🎉`, {
        description: 'Explore the map, check the leaderboard, and drop a vibe!'
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
  city: SupportedCity, 
  venue: { name: string; lat: number; lng: number }
): Promise<string | null> {
  try {
    // Find venue ID from database
    const { data: venueData } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venue.name)
      .single();

    if (!venueData) {
      logger.warn('demo:venue-not-found', { venueName: venue.name });
      return null;
    }

    const expiresAt = calculateExpiryTime();
    const now = new Date().toISOString();

    // Upsert night_status
    await supabase.from('night_statuses').upsert({
      user_id: userId,
      status: 'out',
      venue_id: venueData.id,
      venue_name: venue.name,
      lat: venue.lat,
      lng: venue.lng,
      expires_at: expiresAt,
      updated_at: now,
    }, { onConflict: 'user_id' });

    // Create checkin record
    await supabase.from('checkins').insert({
      user_id: userId,
      venue_id: venueData.id,
      venue_name: venue.name,
      lat: venue.lat,
      lng: venue.lng,
      started_at: now,
    });

    // Update profile so map shows yellow "me" marker
    await supabase.from('profiles').update({
      is_out: true,
      last_known_lat: venue.lat,
      last_known_lng: venue.lng,
      last_location_at: now,
      last_active_at: now,
    }).eq('id', userId);

    logger.debug('demo:checkin-simulated', { userId, venue: venue.name });
    return venue.name;
  } catch (e) {
    logger.error('demo:checkin-failed', { error: String(e) });
    return null;
  }
}
