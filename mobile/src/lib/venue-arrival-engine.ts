import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Port of the web venue-arrival-nudge trigger engine (src/lib/
 * venue-arrival-nudge/trigger.ts): hard GPS/distance gates, 45s dwell,
 * per-venue dismiss cooldowns, global toast cooldown, re-entry detection,
 * and tonight-scoped user suppression. Pure decision logic — delivery is
 * the caller's job (background local notification / foreground banner).
 */

export type NightStatus = 'planning' | 'out' | 'home' | 'heading_out' | 'off' | null;

export interface VenueArrivalContext {
  userId: string;
  status: NightStatus;
  currentVenueId: string | null;
  detectedVenueId: string;
  distance: number; // meters to detected venue
  gpsAccuracy: number;
  lat: number;
  lng: number;
  timestamp: number;
}

export interface NudgeDecision {
  shouldNudge: boolean;
  reason: string;
  deliveryMethod?: 'modal' | 'toast';
}

// Hard gates (non-negotiable)
const GPS_ACCURACY_THRESHOLD = 35; // meters — reject if worse
const MAX_DETECTION_DISTANCE_M = 500;
const VENUE_TRIGGER_RADIUS_M = 200;

// Timing
const DWELL_TIME_MS = 45 * 1000;
const DISMISS_COOLDOWN_MS = 15 * 60 * 1000;
const TOAST_COOLDOWN_MS = 15 * 60 * 1000;

// Re-entry detection
const REENTRY_COOLDOWN_MS = 20 * 60 * 1000;
const REENTRY_MIN_DISTANCE_M = 300;

const STALE_LOCATION_THRESHOLD_MS = 5000;

/* ── State (module-scoped; suppression also persisted for app restarts) ── */

let dwellTracker: { venueId: string; firstSeenAt: number; lastSeenAt: number } | null = null;
let lastToastTime = 0;
let lastDeparture: { venueId: string; departedAt: number; maxDistanceReached: number } | null =
  null;
let lastSnapshot: { lat: number; lng: number; timestamp: number } | null = null;
const dismissedAt = new Map<string, number>();
const suppressedTonight = new Set<string>();

function tonightKey(): string {
  const d = new Date();
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

const SUPPRESS_STORAGE_KEY = 'venue_suppressed';

/** Hydrate tonight's suppressions from disk (call once at startup). */
export async function hydrateArrivalEngine(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SUPPRESS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { night: string; venueIds: string[] };
    if (parsed.night === tonightKey()) {
      for (const id of parsed.venueIds) suppressedTonight.add(id);
    }
  } catch {
    /* fresh state on parse failure */
  }
}

export function suppressVenueTonight(venueId: string): void {
  suppressedTonight.add(venueId);
  AsyncStorage.setItem(
    SUPPRESS_STORAGE_KEY,
    JSON.stringify({ night: tonightKey(), venueIds: [...suppressedTonight] })
  ).catch(() => {});
}

export function dismissVenuePrompt(venueId: string): void {
  dismissedAt.set(venueId, Date.now());
}

function isVenueDismissed(venueId: string): boolean {
  const time = dismissedAt.get(venueId);
  return !!time && Date.now() - time < DISMISS_COOLDOWN_MS;
}

export function markToastShown(venueId: string): void {
  lastToastTime = Date.now();
  dismissedAt.set(venueId, Date.now());
}

export function resetDwellTracker(): void {
  dwellTracker = null;
}

/** Track leaving a venue so quick re-entries don't re-nudge. */
export function recordDeparture(venueId: string, distance: number): void {
  if (!lastDeparture || lastDeparture.venueId !== venueId) {
    lastDeparture = { venueId, departedAt: Date.now(), maxDistanceReached: distance };
  } else {
    lastDeparture.maxDistanceReached = Math.max(lastDeparture.maxDistanceReached, distance);
  }
}

function canReenterVenue(venueId: string): boolean {
  if (!lastDeparture || lastDeparture.venueId !== venueId) return true;
  const timeSince = Date.now() - lastDeparture.departedAt;
  const wentFarEnough = lastDeparture.maxDistanceReached >= REENTRY_MIN_DISTANCE_M;
  return timeSince >= REENTRY_COOLDOWN_MS && wentFarEnough;
}

function isLocationStale(lat: number, lng: number, timestamp: number): boolean {
  if (!lastSnapshot) return false;
  const samePosition = lastSnapshot.lat === lat && lastSnapshot.lng === lng;
  return samePosition && Math.abs(timestamp - lastSnapshot.timestamp) < STALE_LOCATION_THRESHOLD_MS;
}

/** Returns true once the venue has been observed for ≥45s across fixes. */
function updateDwellTime(venueId: string): boolean {
  const now = Date.now();
  if (!dwellTracker || dwellTracker.venueId !== venueId) {
    dwellTracker = { venueId, firstSeenAt: now, lastSeenAt: now };
    return false;
  }
  dwellTracker.lastSeenAt = now;
  return now - dwellTracker.firstSeenAt >= DWELL_TIME_MS;
}

/* ── Main unified trigger ── */

export function canTriggerVenueArrival(context: VenueArrivalContext): NudgeDecision {
  // Universal hard gates
  if (context.gpsAccuracy > GPS_ACCURACY_THRESHOLD) {
    return { shouldNudge: false, reason: `accuracy ${Math.round(context.gpsAccuracy)}m > ${GPS_ACCURACY_THRESHOLD}m` };
  }
  if (context.distance > MAX_DETECTION_DISTANCE_M) {
    return { shouldNudge: false, reason: `distance ${Math.round(context.distance)}m > ${MAX_DETECTION_DISTANCE_M}m` };
  }
  if (context.distance > VENUE_TRIGGER_RADIUS_M) {
    return { shouldNudge: false, reason: `outside trigger radius (${Math.round(context.distance)}m)` };
  }
  if (isLocationStale(context.lat, context.lng, context.timestamp)) {
    return { shouldNudge: false, reason: 'stale/cached location' };
  }
  if (!updateDwellTime(context.detectedVenueId)) {
    return { shouldNudge: false, reason: 'dwell time not met (45s)' };
  }
  lastSnapshot = { lat: context.lat, lng: context.lng, timestamp: context.timestamp };

  // Status-specific flows
  if (context.status === 'out') {
    if (context.currentVenueId && context.currentVenueId === context.detectedVenueId) {
      return { shouldNudge: false, reason: 'same venue as current' };
    }
    if (Date.now() - lastToastTime < TOAST_COOLDOWN_MS) {
      return { shouldNudge: false, reason: 'toast cooldown active' };
    }
    if (!canReenterVenue(context.detectedVenueId)) {
      return { shouldNudge: false, reason: 're-entry cooldown (20min + 300m)' };
    }
    if (suppressedTonight.has(context.detectedVenueId)) {
      return { shouldNudge: false, reason: 'venue suppressed tonight' };
    }
    return { shouldNudge: true, reason: 'OK', deliveryMethod: 'toast' };
  }

  if (context.status === 'planning' || context.status === null) {
    if (isVenueDismissed(context.detectedVenueId)) {
      return { shouldNudge: false, reason: 'venue dismissed recently' };
    }
    return { shouldNudge: true, reason: 'OK', deliveryMethod: 'modal' };
  }

  return { shouldNudge: false, reason: `status '${context.status}' blocks nudge` };
}
