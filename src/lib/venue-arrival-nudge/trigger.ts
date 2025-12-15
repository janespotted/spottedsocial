import type { 
  VenueArrivalContext, 
  NudgeDecision, 
  DwellTracker, 
  VenueDeparture,
  LocationSnapshot 
} from './types';

// ============= CONSTANTS =============

// Hard gates (non-negotiable)
const GPS_ACCURACY_THRESHOLD = 50; // meters - reject if worse
const MAX_DETECTION_DISTANCE_M = 500; // Never process if > 500m
const VENUE_TRIGGER_RADIUS_M = 200; // Actual trigger radius

// Timing
const DWELL_TIME_MS = 45 * 1000; // 45 seconds
const DISMISS_COOLDOWN_MS = 15 * 60 * 1000; // 15 min per venue dismiss
const TOAST_COOLDOWN_MS = 15 * 60 * 1000; // 15 min global toast cooldown

// Re-entry detection
const REENTRY_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes
const REENTRY_MIN_DISTANCE_M = 300; // Must have gone 300m+ away

// Stale location detection
const STALE_LOCATION_THRESHOLD_MS = 5000; // 5 seconds

// ============= STATE =============

let dwellTracker: DwellTracker | null = null;
let lastToastTime = 0;
let lastDeparture: VenueDeparture | null = null;
let lastLocationSnapshot: LocationSnapshot | null = null;
let previousVenueId: string | null = null;

// ============= UTILITY FUNCTIONS =============

function getTonightKey(): string {
  const now = new Date();
  const nightDate = new Date(now);
  if (now.getHours() < 5) {
    nightDate.setDate(nightDate.getDate() - 1);
  }
  return nightDate.toISOString().split('T')[0];
}

// ============= STALE LOCATION DETECTION =============

function isLocationStale(lat: number, lng: number, timestamp: number): boolean {
  if (!lastLocationSnapshot) {
    return false;
  }
  
  // If coords are identical and timestamps are too close, it's cached
  const isSamePosition = 
    lastLocationSnapshot.lat === lat && 
    lastLocationSnapshot.lng === lng;
  
  const timeDiff = Math.abs(timestamp - lastLocationSnapshot.timestamp);
  
  return isSamePosition && timeDiff < STALE_LOCATION_THRESHOLD_MS;
}

export function updateLocationSnapshot(lat: number, lng: number, timestamp: number): void {
  lastLocationSnapshot = { lat, lng, timestamp };
}

// ============= DWELL TIME TRACKING =============

function updateDwellTime(venueId: string): boolean {
  const now = Date.now();
  
  if (!dwellTracker || dwellTracker.venueId !== venueId) {
    // New venue - start tracking
    dwellTracker = { venueId, firstSeenAt: now, lastSeenAt: now };
    return false;
  }
  
  // Same venue - update and check dwell time
  dwellTracker.lastSeenAt = now;
  return (now - dwellTracker.firstSeenAt) >= DWELL_TIME_MS;
}

export function resetDwellTracker(): void {
  dwellTracker = null;
}

// ============= RE-ENTRY DETECTION =============

export function recordDeparture(venueId: string, distance: number): void {
  if (!lastDeparture || lastDeparture.venueId !== venueId) {
    // New departure
    lastDeparture = {
      venueId,
      departedAt: Date.now(),
      maxDistanceReached: distance,
    };
  } else {
    // Update max distance if still tracking same venue departure
    lastDeparture.maxDistanceReached = Math.max(
      lastDeparture.maxDistanceReached,
      distance
    );
  }
}

function canReenterVenue(venueId: string): boolean {
  // If no departure recorded for this venue, always allow
  if (!lastDeparture || lastDeparture.venueId !== venueId) {
    return true;
  }
  
  const now = Date.now();
  const timeSinceDeparture = now - lastDeparture.departedAt;
  const wentFarEnough = lastDeparture.maxDistanceReached >= REENTRY_MIN_DISTANCE_M;
  
  // Allow re-entry if: 20+ min passed AND went 300m+ away
  return timeSinceDeparture >= REENTRY_COOLDOWN_MS && wentFarEnough;
}

export function clearDepartureTracking(): void {
  lastDeparture = null;
}

// ============= VENUE TRACKING STATE =============

export function updatePreviousVenue(venueId: string | null): void {
  previousVenueId = venueId;
}

export function getPreviousVenueId(): string | null {
  return previousVenueId;
}

// ============= VENUE SUPPRESSION (User "Not here" action) =============

function isVenueSuppressed(venueId: string): boolean {
  const key = `venue_suppressed_${getTonightKey()}_${venueId}`;
  return localStorage.getItem(key) === 'true';
}

export function suppressVenueTonight(venueId: string): void {
  const key = `venue_suppressed_${getTonightKey()}_${venueId}`;
  localStorage.setItem(key, 'true');
}

// ============= VENUE DISMISSAL (Modal dismiss cooldown) =============

export function isVenueDismissed(venueId: string): boolean {
  const key = `venue_arrival_dismissed_${venueId}`;
  const dismissedTime = localStorage.getItem(key);
  if (!dismissedTime) return false;
  return Date.now() - parseInt(dismissedTime, 10) < DISMISS_COOLDOWN_MS;
}

export function dismissVenuePrompt(venueId: string): void {
  localStorage.setItem(`venue_arrival_dismissed_${venueId}`, Date.now().toString());
}

// ============= TOAST TRACKING =============

export function markToastShown(venueId: string): void {
  lastToastTime = Date.now();
  // Also mark venue as shown tonight for tracking
  const key = `venue_toast_shown_${getTonightKey()}_${venueId}`;
  localStorage.setItem(key, 'true');
}

function isToastCooldownActive(): boolean {
  return Date.now() - lastToastTime < TOAST_COOLDOWN_MS;
}

// ============= MAIN UNIFIED TRIGGER ENGINE =============

export function canTriggerVenueArrival(context: VenueArrivalContext): NudgeDecision {
  // === UNIVERSAL HARD GATES ===
  
  // 1. GPS accuracy hard gate (≤50m)
  if (context.gpsAccuracy > GPS_ACCURACY_THRESHOLD) {
    return { 
      shouldNudge: false, 
      reason: `GPS accuracy too low: ${Math.round(context.gpsAccuracy)}m (need ≤${GPS_ACCURACY_THRESHOLD}m)` 
    };
  }
  
  // 2. Distance hard gate - reject if >500m entirely
  if (context.distance > MAX_DETECTION_DISTANCE_M) {
    return { 
      shouldNudge: false, 
      reason: `Distance too far: ${Math.round(context.distance)}m (limit: ${MAX_DETECTION_DISTANCE_M}m)` 
    };
  }
  
  // 3. Must be within trigger radius
  if (context.distance > VENUE_TRIGGER_RADIUS_M) {
    return { 
      shouldNudge: false, 
      reason: `Outside trigger radius: ${Math.round(context.distance)}m (need ≤${VENUE_TRIGGER_RADIUS_M}m)` 
    };
  }
  
  // 4. Stale location rejection
  if (isLocationStale(context.lat, context.lng, context.timestamp)) {
    return { 
      shouldNudge: false, 
      reason: 'Stale/cached location detected' 
    };
  }
  
  // 5. Dwell time check (45 seconds)
  if (!updateDwellTime(context.detectedVenueId)) {
    const elapsed = dwellTracker 
      ? Math.round((Date.now() - dwellTracker.firstSeenAt) / 1000)
      : 0;
    return { 
      shouldNudge: false, 
      reason: `Dwell time not met: ${elapsed}s / 45s required` 
    };
  }
  
  // Update location snapshot after passing gates
  updateLocationSnapshot(context.lat, context.lng, context.timestamp);
  
  // === STATUS-SPECIFIC LOGIC ===
  
  if (context.status === 'out') {
    return canTriggerToastFlow(context);
  } else if (context.status === 'planning' || context.status === null) {
    return canTriggerModalFlow(context);
  } else {
    // home, heading_out, off → no nudge
    return { 
      shouldNudge: false, 
      reason: `Status '${context.status}' blocks nudge` 
    };
  }
}

// ============= TOAST FLOW (Already "out" users) =============

function canTriggerToastFlow(context: VenueArrivalContext): NudgeDecision {
  // Must be different from current venue
  if (context.currentVenueId && context.currentVenueId === context.detectedVenueId) {
    return { 
      shouldNudge: false, 
      reason: 'Same venue as current' 
    };
  }
  
  // Global toast cooldown
  if (isToastCooldownActive()) {
    const remaining = Math.round((TOAST_COOLDOWN_MS - (Date.now() - lastToastTime)) / 60000);
    return { 
      shouldNudge: false, 
      reason: `Toast cooldown active: ${remaining} min remaining` 
    };
  }
  
  // Re-entry check (20min + 300m away required)
  if (!canReenterVenue(context.detectedVenueId)) {
    return { 
      shouldNudge: false, 
      reason: 'Re-entry cooldown active (need 20min away + 300m distance)' 
    };
  }
  
  // User suppressed this venue tonight ("Not here" action)
  if (isVenueSuppressed(context.detectedVenueId)) {
    return { 
      shouldNudge: false, 
      reason: 'Venue suppressed by user for tonight' 
    };
  }
  
  return { 
    shouldNudge: true, 
    reason: 'OK',
    deliveryMethod: 'toast'
  };
}

// ============= MODAL FLOW (Planning/no-status users) =============

function canTriggerModalFlow(context: VenueArrivalContext): NudgeDecision {
  // Venue-specific dismiss cooldown
  if (isVenueDismissed(context.detectedVenueId)) {
    return { 
      shouldNudge: false, 
      reason: 'Venue dismissed recently' 
    };
  }
  
  return { 
    shouldNudge: true, 
    reason: 'OK',
    deliveryMethod: 'modal'
  };
}

// ============= LEGACY EXPORTS (for backwards compatibility during migration) =============

// These can be removed once all consumers use the unified trigger

let isChecking = false;

export function markCheckingStart(): void {
  isChecking = true;
}

export function markCheckingEnd(): void {
  isChecking = false;
}

// Legacy trigger functions - now just wrappers
export function canTrigger(context: {
  userId: string;
  status: string | null;
  currentVenueId?: string;
  detectedVenueId?: string;
  gpsAccuracy?: number;
}): NudgeDecision {
  console.warn('[trigger.ts] canTrigger is deprecated, use canTriggerVenueArrival');
  return { shouldNudge: false, reason: 'Use canTriggerVenueArrival instead' };
}

export function canTriggerToast(context: {
  userId: string;
  status: string | null;
  currentVenueId: string | null;
  detectedVenueId: string;
  gpsAccuracy: number;
  locationSharingLevel: string;
}): NudgeDecision {
  console.warn('[trigger.ts] canTriggerToast is deprecated, use canTriggerVenueArrival');
  return { shouldNudge: false, reason: 'Use canTriggerVenueArrival instead' };
}
