// City detection service for multi-city bootstrap mode (NYC + LA + Palm Beach)

export type SupportedCity = 'nyc' | 'la' | 'pb';

export const CITY_CENTERS = {
  nyc: { lat: 40.7128, lng: -74.0060, radius: 100 }, // 100 mile radius
  la: { lat: 34.0522, lng: -118.2437, radius: 100 },
  pb: { lat: 26.7056, lng: -80.0364, radius: 10 }, // 10 mile radius - Palm Beach Island + West Palm Beach only
};

const CITY_CACHE_KEY = 'detected_city';

/**
 * Get cached city from localStorage
 */
export function getCachedCity(): SupportedCity | null {
  try {
    const cached = localStorage.getItem(CITY_CACHE_KEY);
    if (cached === 'nyc' || cached === 'la' || cached === 'pb') {
      return cached;
    }
  } catch (error) {
    console.error('Error reading cached city:', error);
  }
  return null;
}

/**
 * Cache detected city in localStorage
 */
export function cacheCity(city: SupportedCity): void {
  try {
    localStorage.setItem(CITY_CACHE_KEY, city);
    // Dispatch event for reactive components
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
  const nycDistance = calculateDistance(coords, CITY_CENTERS.nyc);
  const laDistance = calculateDistance(coords, CITY_CENTERS.la);
  const pbDistance = calculateDistance(coords, CITY_CENTERS.pb);
  
  // Check Palm Beach first (smaller radius, more specific)
  if (pbDistance <= CITY_CENTERS.pb.radius) {
    return 'pb';
  }
  
  // Check if within NYC radius
  if (nycDistance <= CITY_CENTERS.nyc.radius) {
    return 'nyc';
  }
  
  // Check if within LA radius
  if (laDistance <= CITY_CENTERS.la.radius) {
    return 'la';
  }
  
  // If outside all radii, return closest city
  const minDistance = Math.min(nycDistance, laDistance, pbDistance);
  if (minDistance === pbDistance) return 'pb';
  if (minDistance === laDistance) return 'la';
  return 'nyc';
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
