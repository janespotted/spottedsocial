/** Shared rules for accepted fixes and honest map freshness. No native dependencies. */
export const MAX_FIX_AGE_MS = 120_000;
export const MAX_LIVE_ACCURACY_M = 65;
export const ARRIVAL_ACCURACY_M = 35;
export const STALE_AFTER_MS = 15 * 60_000;

export interface LocationFix {
  lat: number;
  lng: number;
  accuracy: number;
  recordedAt: string;
  speed: number | null;
}

export function validFix(fix: LocationFix, now = Date.now()): boolean {
  const time = Date.parse(fix.recordedAt);
  return Number.isFinite(fix.lat) && Math.abs(fix.lat) <= 90 &&
    Number.isFinite(fix.lng) && Math.abs(fix.lng) <= 180 &&
    Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= MAX_LIVE_ACCURACY_M &&
    Number.isFinite(time) && time <= now + 15_000 && now - time <= MAX_FIX_AGE_MS;
}

export function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function locationAge(timestamp: string | null, now = Date.now()): number {
  const t = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(t) ? Math.max(0, now - t) : Infinity;
}

export function locationLabel(timestamp: string | null, now = Date.now()): string {
  const age = locationAge(timestamp, now);
  if (!Number.isFinite(age)) return 'Location unavailable';
  if (age < 60_000) return 'Updated just now';
  const minutes = Math.floor(age / 60_000);
  return minutes < 60 ? `Updated ${minutes} min ago` : `Updated ${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export interface ClusterSpot {
  lat: number;
  lng: number;
  venue_id?: string | null;
  is_private_party: boolean;
  last_location_at: string | null;
}

export function canGroupSpots(a: ClusterSpot, b: ClusterSpot, now = Date.now()): boolean {
  // Last-known locations must never imply that two people are together now.
  if ((!a.is_private_party && locationAge(a.last_location_at, now) >= STALE_AFTER_MS) ||
      (!b.is_private_party && locationAge(b.last_location_at, now) >= STALE_AFTER_MS)) return false;
  const distance = distanceBetween(a, b);
  return distance < 5 || (!!a.venue_id && a.venue_id === b.venue_id && distance <= 60);
}

export function normalizeVenueMatch(row: Record<string, unknown>): { id: string; name: string; distance: number } | null {
  const id = row.venue_id ?? row.id;
  const name = row.venue_name ?? row.name;
  const distance = row.distance_meters ?? row.distance;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || !name ||
      typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) return null;
  return { id, name, distance };
}
