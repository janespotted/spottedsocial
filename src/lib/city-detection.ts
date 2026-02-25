// City detection service for multi-city bootstrap mode (NYC + LA)

export type SupportedCity = 'nyc' | 'la' | 'pb';

export const CITY_CENTERS = {
  nyc: { lat: 40.7128, lng: -74.0060, radius: 100 },
  la: { lat: 34.0522, lng: -118.2437, radius: 100 },
  pb: { lat: 26.7056, lng: -80.0364, radius: 10 },
};

const CITY_CACHE_KEY = 'detected_city';
const CITY_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours in ms

/**
 * Get cached city from localStorage (returns null if expired)
 */
export function getCachedCity(): SupportedCity | null {
  try {
    const raw = localStorage.getItem(CITY_CACHE_KEY);
    if (!raw) return null;
    
    // Support legacy format (plain string) and new format ({city, timestamp})
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.city && parsed.timestamp) {
        const age = Date.now() - parsed.timestamp;
        if (age > CITY_CACHE_TTL) {
          console.log('City cache expired after', Math.round(age / 60000), 'min');
          return null;
        }
        if (parsed.city === 'nyc' || parsed.city === 'la' || parsed.city === 'pb') {
          return parsed.city;
        }
      }
    } catch {
      // Legacy plain string format
      if (raw === 'nyc' || raw === 'la' || raw === 'pb') {
        return raw;
      }
    }
  } catch (error) {
    console.error('Error reading cached city:', error);
  }
  return null;
}

/**
 * Cache detected city in localStorage with timestamp
 */
export function cacheCity(city: SupportedCity): void {
  try {
    localStorage.setItem(CITY_CACHE_KEY, JSON.stringify({ city, timestamp: Date.now() }));
    window.dispatchEvent(new CustomEvent('cityChanged', { detail: { city } }));
  } catch (error) {
    console.error('Error caching city:', error);
  }
}

/**
 * Calculate distance between two coordinates in miles using Haversine formula
 */
export function calculateDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get current GPS position
 */
function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0, // Force fresh GPS reading
      }
    );
  });
}

/**
 * Find closest city based on GPS coordinates
 */
function findClosestCity(coords: { lat: number; lng: number }): SupportedCity {
  let closest: SupportedCity = 'nyc';
  let minDistance = Infinity;

  for (const [city, center] of Object.entries(CITY_CENTERS) as [SupportedCity, typeof CITY_CENTERS.nyc][]) {
    const dist = calculateDistance(coords, center);
    if (dist <= center.radius && dist < minDistance) {
      closest = city;
      minDistance = dist;
    }
  }

  if (minDistance === Infinity) {
    // Outside all radii, find absolute closest
    for (const [city, center] of Object.entries(CITY_CENTERS) as [SupportedCity, typeof CITY_CENTERS.nyc][]) {
      const dist = calculateDistance(coords, center);
      if (dist < minDistance) {
        closest = city;
        minDistance = dist;
      }
    }
  }

  return closest;
}

/**
 * Detect user's city based on GPS location
 * Falls back to NYC on failure or cached value
 * @param forceRefresh - If true, skip cache and always use GPS
 */
export async function detectUserCity(forceRefresh = false): Promise<SupportedCity> {
  // 1. Check cached city first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = getCachedCity();
    if (cached) {
      console.log('Using cached city:', cached);
      return cached;
    }
  }
  
  // 2. Try GPS detection
  try {
    console.log('Detecting city via GPS...');
    const position = await getCurrentPosition();
    const city = findClosestCity(position);
    console.log('Detected city:', city, 'at coordinates:', position);
    cacheCity(city);
    return city;
  } catch (error) {
    console.warn('City detection failed, defaulting to NYC:', error);
    // 3. Default to NYC on failure
    const defaultCity = 'nyc';
    cacheCity(defaultCity);
    return defaultCity;
  }
}

/**
 * Clear cached city (useful for testing or manual override)
 */
export function clearCachedCity(): void {
  try {
    localStorage.removeItem(CITY_CACHE_KEY);
    window.dispatchEvent(new CustomEvent('cityChanged', { detail: { city: null } }));
  } catch (error) {
    console.error('Error clearing cached city:', error);
  }
}
