import { supabase } from '@/integrations/supabase/client';
import { captureLocationWithVenue, calculateDistance, findNearestVenue, type LocationData } from './location-service';
import { logEvent } from './event-logger';

interface LastCheckin {
  id: string;
  lat: number;
  lng: number;
  venue_id: string | null;
  venue_name: string;
  created_at: string;
  started_at?: string;
  ended_at?: string | null;
  last_updated_at?: string;
}

interface TrackingState {
  lastGPS: { lat: number; lng: number; timestamp: string } | null;
  wasInBackground: boolean;
  lastTrackTime: number;
  lastManualCheckinTime: number;
}

// Global debounce: 30 seconds between tracking calls
const TRACK_DEBOUNCE_MS = 30000;
// Cooldown after manual check-in: 30 minutes
const MANUAL_CHECKIN_COOLDOWN_MS = 30 * 60 * 1000;

const trackingState: TrackingState = {
  lastGPS: null,
  wasInBackground: false,
  lastTrackTime: 0,
  lastManualCheckinTime: 0,
};

/**
 * Mark that the user just manually confirmed a venue.
 * Prevents autoTrackVenue from overwriting for 30 minutes.
 */
export const markManualCheckin = (): void => {
  trackingState.lastManualCheckinTime = Date.now();
  console.log('🔒 Manual checkin marked — auto-tracking paused for 30 min');
};

// Detect if app was in background
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      trackingState.wasInBackground = true;
    }
  });
}

/**
 * Calculate speed in mph between two GPS points
 */
const calculateSpeed = (
  lat1: number,
  lng1: number,
  timestamp1: string,
  lat2: number,
  lng2: number,
  timestamp2: string
): number => {
  const distanceMeters = calculateDistance(lat1, lng1, lat2, lng2);
  const time1 = new Date(timestamp1).getTime();
  const time2 = new Date(timestamp2).getTime();
  const timeHours = Math.abs(time2 - time1) / (1000 * 60 * 60);
  
  if (timeHours === 0) return 0;
  
  const distanceMiles = distanceMeters / 1609.34;
  return distanceMiles / timeHours;
};

/**
 * Check if coordinates are in a nightlife zone (near any venue)
 */
const isInNightlifeZone = async (lat: number, lng: number): Promise<boolean> => {
  try {
    // Check if within 500m of any venue in database
    const nearbyVenue = await findNearestVenue(lat, lng, 500);
    return nearbyVenue !== null;
  } catch (error) {
    console.error('Error checking nightlife zone:', error);
    return false;
  }
};

/**
 * Get user's last check-in (active or most recent ended)
 */
const getLastCheckin = async (userId: string): Promise<LastCheckin | null> => {
  try {
    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data as LastCheckin | null;
  } catch (error) {
    console.error('Error fetching last checkin:', error);
    return null;
  }
};

/**
 * Check if user is currently marked as "Out"
 */
const isUserOut = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('night_statuses')
      .select('status, expires_at')
      .eq('user_id', userId)
      .single();

    if (error) return false;
    
    if (!data || data.status !== 'out') return false;
    
    // Check if status hasn't expired
    if (data.expires_at) {
      const expiresAt = new Date(data.expires_at);
      if (expiresAt < new Date()) return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking user status:', error);
    return false;
  }
};

/**
 * Create a new checkin record and end any active check-ins
 */
const createCheckin = async (
  userId: string,
  locationData: LocationData,
  venueId: string,
  venueName: string
): Promise<void> => {
  try {
    // End any active check-ins before creating new one
    await supabase
      .from('checkins')
      .update({ ended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('ended_at', null);

    // Create new check-in with tracking fields
    await supabase.from('checkins').insert({
      user_id: userId,
      venue_name: venueName,
      venue_id: venueId,
      lat: locationData.lat,
      lng: locationData.lng,
      started_at: locationData.timestamp,
      last_updated_at: locationData.timestamp,
    });

    // Update night_statuses with new venue
    await supabase
      .from('night_statuses')
      .update({
        venue_name: venueName,
        venue_id: venueId,
        lat: locationData.lat,
        lng: locationData.lng,
        updated_at: locationData.timestamp,
      })
      .eq('user_id', userId);

    // Update profile with new location
    await supabase
      .from('profiles')
      .update({
        last_known_lat: locationData.lat,
        last_known_lng: locationData.lng,
        last_location_at: locationData.timestamp,
      })
      .eq('id', userId);

    console.log('✅ Auto-updated venue to:', venueName);
  } catch (error) {
    console.error('Error creating checkin:', error);
  }
};

/**
 * Main function: Auto-track venue changes
 * Call this on app open and major interactions when user is "Out"
 */
export const autoTrackVenue = async (userId: string): Promise<void> => {
  try {
    // Debounce: skip if called within 30 seconds
    const currentTime = Date.now();
    if (currentTime - trackingState.lastTrackTime < TRACK_DEBOUNCE_MS) {
      // Use debug to reduce log spam in production
      console.debug('🔵 Auto-tracking debounced (within 30s cooldown)');
      return;
    }
    trackingState.lastTrackTime = currentTime;

    // Skip if user manually checked in within the last 30 minutes
    if (currentTime - trackingState.lastManualCheckinTime < MANUAL_CHECKIN_COOLDOWN_MS) {
      console.debug('🔒 Auto-tracking paused (manual checkin cooldown)');
      return;
    }

    // Check if user is marked as "Out"
    const isOut = await isUserOut(userId);
    if (!isOut) {
      console.debug('🔵 User not marked as Out, skipping auto-tracking');
      return;
    }

    // Get last checkin
    const lastCheckin = await getLastCheckin(userId);
    if (!lastCheckin) {
      console.log('🔵 No previous checkin found, skipping auto-tracking');
      return;
    }

    // Check if last checkin was within 90 minutes
    const lastCheckinTime = new Date(lastCheckin.started_at || lastCheckin.created_at).getTime();
    const now = Date.now();
    const minutesSinceLastCheckin = (now - lastCheckinTime) / (1000 * 60);
    
    if (minutesSinceLastCheckin > 90) {
      console.log('🔵 Last checkin was >90 minutes ago, skipping auto-tracking');
      return;
    }

    // Capture fresh GPS coordinates
    const locationData = await captureLocationWithVenue();
    
    // Calculate distance from last checkin
    const distanceMeters = calculateDistance(
      lastCheckin.lat,
      lastCheckin.lng,
      locationData.lat,
      locationData.lng
    );

    console.log('📍 Distance from last venue:', Math.round(distanceMeters), 'meters');

    // If <200m, no update needed
    if (distanceMeters < 200) {
      console.log('🔵 Still at same venue (<200m), updating GPS and check-in timestamp');
      
      // Update the active check-in's last_updated_at
      await supabase
        .from('checkins')
        .update({ last_updated_at: locationData.timestamp })
        .eq('user_id', userId)
        .is('ended_at', null);
      
      // Update profile with fresh GPS but keep same venue
      await supabase
        .from('profiles')
        .update({
          last_known_lat: locationData.lat,
          last_known_lng: locationData.lng,
          last_location_at: locationData.timestamp,
        })
        .eq('id', userId);
      return;
    }

    // Check if app was in background
    if (trackingState.wasInBackground) {
      console.log('🔵 App was in background, skipping auto-update');
      trackingState.wasInBackground = false;
      return;
    }

    // Calculate speed if we have previous GPS data
    if (trackingState.lastGPS) {
      const speed = calculateSpeed(
        trackingState.lastGPS.lat,
        trackingState.lastGPS.lng,
        trackingState.lastGPS.timestamp,
        locationData.lat,
        locationData.lng,
        locationData.timestamp
      );

      console.log('🚗 Detected speed:', speed.toFixed(1), 'mph');

      if (speed > 12) {
        console.log('🔵 Speed >12 mph (car/transit), skipping auto-update');
        trackingState.lastGPS = {
          lat: locationData.lat,
          lng: locationData.lng,
          timestamp: locationData.timestamp,
        };
        return;
      }
    }

    // Check if in nightlife zone
    const inZone = await isInNightlifeZone(locationData.lat, locationData.lng);
    if (!inZone) {
      console.log('🔵 Not in nightlife zone, skipping auto-update');
      trackingState.lastGPS = {
        lat: locationData.lat,
        lng: locationData.lng,
        timestamp: locationData.timestamp,
      };
      return;
    }

    // Find nearest venue at new location
    const nearestVenue = await findNearestVenue(locationData.lat, locationData.lng, 200);
    
    if (!nearestVenue) {
      console.log('🔵 No venue found at new location, skipping auto-update');
      trackingState.lastGPS = {
        lat: locationData.lat,
        lng: locationData.lng,
        timestamp: locationData.timestamp,
      };
      return;
    }

    // Check if it's actually a different venue
    if (nearestVenue.id === lastCheckin.venue_id) {
      console.log('🔵 Same venue detected, no update needed');
      return;
    }

    // All conditions met - auto-update venue
    console.log('✨ Auto-updating venue from', lastCheckin.venue_name, 'to', nearestVenue.name);
    
    await createCheckin(userId, locationData, nearestVenue.id, nearestVenue.name);
    
    // Log location update
    logEvent('location_update', {
      venue_id: nearestVenue.id,
      venue_name: nearestVenue.name,
      lat: locationData.lat,
      lng: locationData.lng,
      previous_venue: lastCheckin.venue_name,
      source: 'auto_track',
    });

    // Update tracking state
    trackingState.lastGPS = {
      lat: locationData.lat,
      lng: locationData.lng,
      timestamp: locationData.timestamp,
    };
    trackingState.wasInBackground = false;

  } catch (error) {
    console.error('Error in auto-track venue:', error);
  }
};

/**
 * Get user's current venue from latest checkin
 */
export const getCurrentVenueFromCheckin = async (userId: string) => {
  const lastCheckin = await getLastCheckin(userId);
  if (!lastCheckin) return null;

  return {
    venueId: lastCheckin.venue_id,
    venueName: lastCheckin.venue_name,
    lat: lastCheckin.lat,
    lng: lastCheckin.lng,
    timestamp: lastCheckin.created_at,
  };
};
