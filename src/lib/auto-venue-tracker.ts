import { supabase } from '@/integrations/supabase/client';
import { captureLocationWithVenue, calculateDistance, findNearestVenue, type LocationData } from './location-service';

interface LastCheckin {
  id: string;
  lat: number;
  lng: number;
  venue_id: string | null;
  venue_name: string;
  created_at: string;
}

interface TrackingState {
  lastGPS: { lat: number; lng: number; timestamp: string } | null;
  wasInBackground: boolean;
}

const trackingState: TrackingState = {
  lastGPS: null,
  wasInBackground: false,
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
 * Get user's last check-in
 */
const getLastCheckin = async (userId: string): Promise<LastCheckin | null> => {
  try {
    const { data, error } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data as LastCheckin;
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
 * Create a new checkin record
 */
const createCheckin = async (
  userId: string,
  locationData: LocationData,
  venueId: string,
  venueName: string
): Promise<void> => {
  try {
    await supabase.from('checkins').insert({
      user_id: userId,
      venue_name: venueName,
      venue_id: venueId,
      lat: locationData.lat,
      lng: locationData.lng,
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
    // Check if user is marked as "Out"
    const isOut = await isUserOut(userId);
    if (!isOut) {
      console.log('🔵 User not marked as Out, skipping auto-tracking');
      return;
    }

    // Get last checkin
    const lastCheckin = await getLastCheckin(userId);
    if (!lastCheckin) {
      console.log('🔵 No previous checkin found, skipping auto-tracking');
      return;
    }

    // Check if last checkin was within 90 minutes
    const lastCheckinTime = new Date(lastCheckin.created_at).getTime();
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
      console.log('🔵 Still at same venue (<200m), updating GPS only');
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
