import BackgroundGeolocation from 'react-native-background-geolocation';
import { supabase } from './supabase';
import { CITY_NEIGHBORHOODS } from './city-neighborhoods';
import { ensureLocationReady } from './location-ready';
import { normalizeVenueMatch } from './location-quality';

/**
 * Port of the web src/lib/location-service.ts core: accurate GPS capture,
 * venue proximity lookups, and neighborhood detection. The Mapbox POI
 * discovery fallback (create_venue_from_discovery) is deferred — venue
 * matching runs on the curated venues table via RPCs.
 */

export interface VenueMatch {
  id: string;
  name: string;
  distance: number;
}

export interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
  venueId: string | null;
  venueName: string | null;
  nearbyVenues: VenueMatch[];
}

// meters — indoor/urban GPS rarely does better than 100m
export const GPS_ACCURACY_THRESHOLD_CHECKIN = 150;
// relaxed for demo mode (indoor/urban)
export const GPS_ACCURACY_THRESHOLD_DEMO = 200;

/**
 * Multi-sample GPS fix via the Transistorsoft SDK (it samples natively and
 * returns the best). Throws on permission denial or timeout.
 */
export async function getAccurateLocation(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
  recordedAt: string;
}> {
  await ensureLocationReady();
  const location = await BackgroundGeolocation.getCurrentPosition({
    timeout: 15,
    samples: 3,
    maximumAge: 0,
    desiredAccuracy: 40,
    persist: false,
  });
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy,
    recordedAt: new Date(location.timestamp).toISOString(),
  };
}

export async function findNearestVenue(
  lat: number,
  lng: number,
  radiusMeters = 200
): Promise<VenueMatch | null> {
  try {
    const { data, error } = await (
      supabase.rpc as (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }>
    )('find_nearest_venue', { user_lat: lat, user_lng: lng, radius_meters: radiusMeters });
    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows.length ? normalizeVenueMatch(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function findNearbyVenues(
  lat: number,
  lng: number,
  radiusMeters = 500,
  maxResults = 10
): Promise<VenueMatch[]> {
  try {
    const { data, error } = await (
      supabase.rpc as (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }>
    )('find_nearby_venues', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radiusMeters,
      max_results: maxResults,
    });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>)
      .map(normalizeVenueMatch).filter((v): v is VenueMatch => v !== null);
  } catch {
    return [];
  }
}

/**
 * Capture GPS (gated on accuracy) and derive the nearby venue candidates.
 * The nearest venue is nearbyVenues[0]. Throws "accuracy too low" when the
 * fix is worse than the threshold — callers retry with the relaxed 200m.
 */
export async function captureLocationWithVenue(
  accuracyThreshold: number = GPS_ACCURACY_THRESHOLD_CHECKIN
): Promise<LocationData> {
  const coords = await getAccurateLocation();
  if (coords.accuracy > accuracyThreshold) {
    throw new Error(
      `GPS accuracy too low (${Math.round(coords.accuracy)}m). Move to an open area and try again.`
    );
  }
  const nearbyVenues = await findNearbyVenues(coords.lat, coords.lng, 500, 10);
  const nearest = nearbyVenues[0] ?? null;
  return {
    lat: coords.lat,
    lng: coords.lng,
    accuracy: coords.accuracy,
    timestamp: coords.recordedAt,
    venueId: nearest?.id ?? null,
    venueName: nearest?.name ?? null,
    nearbyVenues,
  };
}

/** Mapbox reverse geocode → neighborhood name (web parity). */
export async function reverseGeocodeNeighborhood(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const token = process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    if (!token) return null;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=neighborhood,locality&access_token=${token}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    for (const feature of data.features ?? []) {
      if (feature.place_type?.includes('neighborhood') || feature.place_type?.includes('locality')) {
        return feature.text ?? null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Map a geocoded neighborhood name onto the city's curated list (fuzzy contains-match). */
export function matchNeighborhood(raw: string | null, city: string): string | null {
  if (!raw) return null;
  const options = CITY_NEIGHBORHOODS[city] ?? [];
  const lower = raw.toLowerCase();
  const exact = options.find((n) => n.toLowerCase() === lower);
  if (exact) return exact;
  const partial = options.find(
    (n) => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase())
  );
  return partial ?? null;
}

/** Neighborhood for known coordinates — no new GPS fix, no permission prompt. */
export async function neighborhoodFromCoords(
  lat: number,
  lng: number,
  city: string
): Promise<string | null> {
  return matchNeighborhood(await reverseGeocodeNeighborhood(lat, lng), city);
}

/**
 * Detect the user's current neighborhood, mapped onto the city's curated
 * list (fuzzy contains-match like the web port).
 */
export async function detectNeighborhoodFromGPS(city: string): Promise<string | null> {
  try {
    const coords = await getAccurateLocation();
    return await neighborhoodFromCoords(coords.lat, coords.lng, city);
  } catch {
    return null;
  }
}

/** Great-circle distance in meters. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
