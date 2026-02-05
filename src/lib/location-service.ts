import { supabase } from '@/integrations/supabase/client';

export interface LocationData {
  lat: number;
  lng: number;
  timestamp: string;
  venueId: string | null;
  venueName: string | null;
  nearbyVenues: VenueMatch[];
}

export interface VenueMatch {
  id: string;
  name: string;
  distance: number;
}

export type LocationResult = 
  | {
      success: true;
      data: {
        lat: number;
        lng: number;
        accuracy: number;
        timestamp: number;
      };
      warning?: 'low_accuracy';
    }
  | {
      success: false;
      error: 'permission_denied' | 'position_unavailable' | 'timeout' | 'not_supported';
      message: string;
    };

/**
 * Calculate distance between two points using Haversine formula
 */
export const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/**
 * Check if geolocation is supported
 */
export const isGeolocationSupported = (): boolean => {
  return 'geolocation' in navigator;
};

/**
 * Check geolocation permission status
 */
export const checkLocationPermission = async (): Promise<'granted' | 'denied' | 'prompt'> => {
  try {
    if (!navigator.permissions) {
      // Fallback for browsers that don't support permissions API
      return 'prompt';
    }
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state;
  } catch {
    return 'prompt';
  }
};

/**
 * Get current GPS coordinates with proper error handling
 */
export const getCurrentLocation = (): Promise<{ lat: number; lng: number; accuracy: number; timestamp: number }> => {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0, // Force fresh location, no caching
      }
    );
  });
};

/**
 * Get current location with comprehensive error handling and status
 */
export const getLocationWithStatus = async (): Promise<LocationResult> => {
  // Check if geolocation is supported
  if (!isGeolocationSupported()) {
    return {
      success: false,
      error: 'not_supported',
      message: 'Location services are not supported in this browser',
    };
  }

  // Check permission status first
  const permission = await checkLocationPermission();
  if (permission === 'denied') {
    return {
      success: false,
      error: 'permission_denied',
      message: 'Location access is denied. Please enable in browser settings.',
    };
  }

  // Attempt to get position with timeout
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });

    const result: LocationResult = {
      success: true,
      data: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      },
    };

    // Check accuracy threshold (> 100m is considered low)
    if (position.coords.accuracy > 100) {
      result.warning = 'low_accuracy';
    }

    return result;
  } catch (error) {
    const geoError = error as GeolocationPositionError;
    
    switch (geoError.code) {
      case geoError.PERMISSION_DENIED:
        return {
          success: false,
          error: 'permission_denied',
          message: 'Location access was denied. Please enable in settings.',
        };
      case geoError.POSITION_UNAVAILABLE:
        return {
          success: false,
          error: 'position_unavailable',
          message: 'Location information is unavailable.',
        };
      case geoError.TIMEOUT:
        return {
          success: false,
          error: 'timeout',
          message: 'Location request timed out. Please try again.',
        };
      default:
        return {
          success: false,
          error: 'position_unavailable',
          message: 'Could not get your location.',
        };
    }
  }
};

/**
 * Find nearest venue within radius using database function
 */
export const findNearestVenue = async (
  lat: number,
  lng: number,
  radiusMeters: number = 200
): Promise<VenueMatch | null> => {
  try {
    const { data, error } = await supabase.rpc('find_nearest_venue', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radiusMeters,
    });

    if (error) throw error;
    
    if (data && data.length > 0) {
      return {
        id: data[0].venue_id,
        name: data[0].venue_name,
        distance: data[0].distance_meters,
      };
    }

    return null;
  } catch (error) {
    console.error('Error finding nearest venue:', error);
    return null;
  }
};

/**
 * Find multiple nearby venues within radius
 */
export const findNearbyVenues = async (
  lat: number,
  lng: number,
  radiusMeters: number = 500,
  maxResults: number = 10
): Promise<VenueMatch[]> => {
  try {
    const { data, error } = await supabase.rpc('find_nearby_venues', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radiusMeters,
      max_results: maxResults,
    });

    if (error) throw error;
    
    if (data && data.length > 0) {
      return data.map((v: { venue_id: string; venue_name: string; distance_meters: number }) => ({
        id: v.venue_id,
        name: v.venue_name,
        distance: v.distance_meters,
      }));
    }

    return [];
  } catch (error) {
    console.error('Error finding nearby venues:', error);
    return [];
  }
};

/**
 * Create a new venue at given coordinates
 */
export const createNewVenue = async (
  name: string,
  lat: number,
  lng: number,
  neighborhood: string,
  type: 'bar' | 'club' | 'lounge'
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('venues')
      .insert({
        name,
        lat,
        lng,
        neighborhood,
        type,
       is_leaderboard_promoted: false,
       is_map_promoted: false,
        is_demo: false,
      })
      .select('id')
      .single();

    if (error) throw error;
    
    return data?.id || null;
  } catch (error) {
    console.error('Error creating venue:', error);
    return null;
  }
};

/**
 * Main function: Capture location and derive venue
 * Returns complete location data with venue information and nearby alternatives
 */
export const captureLocationWithVenue = async (): Promise<LocationData> => {
  // Get fresh GPS coordinates
  const coords = await getCurrentLocation();
  
  // Create timestamp
  const timestamp = new Date().toISOString();
  
  // Fetch nearby venues (includes the nearest one)
  const nearbyVenues = await findNearbyVenues(coords.lat, coords.lng, 500, 10);
  
  // The nearest venue is the first one (if any)
  const nearestVenue = nearbyVenues.length > 0 ? nearbyVenues[0] : null;
  
  return {
    lat: coords.lat,
    lng: coords.lng,
    timestamp,
    venueId: nearestVenue?.id || null,
    venueName: nearestVenue?.name || null,
    nearbyVenues,
  };
};

/**
 * Get venue details by ID
 */
export const getVenueById = async (venueId: string) => {
  try {
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();

    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error('Error fetching venue:', error);
    return null;
  }
};

/**
 * Detect neighborhood from GPS coordinates by finding the nearest venue
 */
export const detectNeighborhoodFromGPS = async (city: string): Promise<string | null> => {
  try {
    const coords = await getCurrentLocation();
    
    // Find nearest venue within a large radius (50km) just to get neighborhood
    const { data, error } = await supabase.rpc('find_nearest_venue', {
      user_lat: coords.lat,
      user_lng: coords.lng,
      radius_meters: 50000, // 50km radius
    });

    if (error) throw error;
    
    if (data && data.length > 0) {
      // Get the venue to find its neighborhood
      const venue = await getVenueById(data[0].venue_id);
      if (venue?.neighborhood) {
        return venue.neighborhood;
      }
    }

    return null;
  } catch (error) {
    console.error('Error detecting neighborhood:', error);
    return null;
  }
};
