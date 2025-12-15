import type { NudgeTriggerContext, NudgeDecision, ToastTriggerContext, DwellTracker } from './types';

// Constants
const DEBOUNCE_MS = 30000; // 30 seconds between checks
const DISMISS_COOLDOWN_MS = 15 * 60 * 1000; // 15 min per venue

// Toast-specific constants
const TOAST_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes global cooldown
const GPS_ACCURACY_THRESHOLD = 50; // meters - hard gate for all nudges
const DWELL_TIME_MS = 45 * 1000; // 45 seconds

// Trigger state (singleton)
let lastCheckTime = 0;
let isChecking = false;
let lastToastTime = 0;
let dwellTracker: DwellTracker | null = null;

// Status gating table for MODAL prompts
// null = no status set → YES (prompt them)
// planning = intending to go out → YES
// out = already at venue → NO (auto-tracking handles via toast)
// home/off = staying in → NO (respect their choice)
// heading_out = transitioning → NO (let them finish)
const STATUS_ALLOWS_NUDGE: Record<string, boolean> = {
  'null': true,
  'planning': true,
  'out': false,
  'home': false,
  'heading_out': false,
  'off': false,
};

// Get tonight's date key for per-night tracking (resets at 5am)
function getTonightKey(): string {
  const now = new Date();
  const nightDate = new Date(now);
  if (now.getHours() < 5) {
    nightDate.setDate(nightDate.getDate() - 1);
  }
  return nightDate.toISOString().split('T')[0];
}

// Check if venue toast was already shown tonight
function wasVenueShownTonight(venueId: string): boolean {
  const key = `venue_toast_shown_${getTonightKey()}_${venueId}`;
  return localStorage.getItem(key) === 'true';
}

// Mark venue as shown tonight
function markVenueShownTonight(venueId: string): void {
  const key = `venue_toast_shown_${getTonightKey()}_${venueId}`;
  localStorage.setItem(key, 'true');
}

// Suppress venue for rest of night ("Not here" action)
export function suppressVenueTonight(venueId: string): void {
  markVenueShownTonight(venueId);
}

// Update dwell tracker and check if threshold met
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

// Reset dwell tracker (for when user leaves venue area)
export function resetDwellTracker(): void {
  dwellTracker = null;
}

export function canTrigger(context: NudgeTriggerContext): NudgeDecision {
  // 1. Status gating
  const statusKey = context.status ?? 'null';
  if (!STATUS_ALLOWS_NUDGE[statusKey]) {
    return { shouldNudge: false, reason: `Status '${context.status}' blocks nudge` };
  }

  // 2. GPS accuracy gate (hard gate - reject low-confidence reads)
  if (context.gpsAccuracy === undefined || context.gpsAccuracy > GPS_ACCURACY_THRESHOLD) {
    return { shouldNudge: false, reason: `GPS accuracy too low: ${Math.round(context.gpsAccuracy ?? 999)}m (need ≤${GPS_ACCURACY_THRESHOLD}m)` };
  }

  // 3. Dwell time check (45 seconds within radius)
  if (context.detectedVenueId && !updateDwellTime(context.detectedVenueId)) {
    return { shouldNudge: false, reason: 'Dwell time not met (need 45s within radius)' };
  }

  // 4. Debounce
  const now = Date.now();
  if (now - lastCheckTime < DEBOUNCE_MS) {
    return { shouldNudge: false, reason: 'Debounce active' };
  }

  // 5. Checking guard
  if (isChecking) {
    return { shouldNudge: false, reason: 'Check already in progress' };
  }

  return { shouldNudge: true, reason: 'OK' };
}

// Main trigger check for toast (users who are already "out")
export function canTriggerToast(context: ToastTriggerContext): NudgeDecision {
  // 1. Must be "out" status
  if (context.status !== 'out') {
    return { shouldNudge: false, reason: 'Not in out status' };
  }
  
  // 2. Detected venue must be different from current venue (or no venue set)
  if (context.currentVenueId && context.currentVenueId === context.detectedVenueId) {
    return { shouldNudge: false, reason: 'Same venue as current' };
  }
  
  // 3. GPS accuracy gate (hard gate)
  if (context.gpsAccuracy > GPS_ACCURACY_THRESHOLD) {
    return { shouldNudge: false, reason: `GPS accuracy too low: ${Math.round(context.gpsAccuracy)}m` };
  }
  
  // 4. Global cooldown (60 min)
  if (Date.now() - lastToastTime < TOAST_COOLDOWN_MS) {
    return { shouldNudge: false, reason: 'Toast cooldown active' };
  }
  
  // 5. Per-venue per-night check
  if (wasVenueShownTonight(context.detectedVenueId)) {
    return { shouldNudge: false, reason: 'Venue already shown tonight' };
  }
  
  // 6. Dwell time check (45 seconds)
  if (!updateDwellTime(context.detectedVenueId)) {
    return { shouldNudge: false, reason: 'Dwell time not met yet' };
  }
  
  return { shouldNudge: true, reason: 'OK' };
}

export function markToastShown(venueId: string): void {
  lastToastTime = Date.now();
  markVenueShownTonight(venueId);
}

export function isVenueDismissed(venueId: string): boolean {
  const key = `venue_arrival_dismissed_${venueId}`;
  const dismissedTime = localStorage.getItem(key);
  if (!dismissedTime) return false;
  return Date.now() - parseInt(dismissedTime, 10) < DISMISS_COOLDOWN_MS;
}

export function dismissVenuePrompt(venueId: string): void {
  localStorage.setItem(`venue_arrival_dismissed_${venueId}`, Date.now().toString());
}

export function markCheckingStart(): void {
  isChecking = true;
  lastCheckTime = Date.now();
}

export function markCheckingEnd(): void {
  isChecking = false;
}
