import type { NudgeTriggerContext, NudgeDecision, NightStatus } from './types';

// Constants
const DEBOUNCE_MS = 30000; // 30 seconds between checks
const DISMISS_COOLDOWN_MS = 15 * 60 * 1000; // 15 min per venue

// Trigger state (singleton)
let lastCheckTime = 0;
let isChecking = false;

// Status gating table
// null = no status set → YES (prompt them)
// planning = intending to go out → YES
// out = already at venue → NO (auto-tracking handles)
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

export function canTrigger(context: NudgeTriggerContext): NudgeDecision {
  // 1. Status gating
  const statusKey = context.status ?? 'null';
  if (!STATUS_ALLOWS_NUDGE[statusKey]) {
    return { shouldNudge: false, reason: `Status '${context.status}' blocks nudge` };
  }

  // 2. Debounce
  const now = Date.now();
  if (now - lastCheckTime < DEBOUNCE_MS) {
    return { shouldNudge: false, reason: 'Debounce active' };
  }

  // 3. Checking guard
  if (isChecking) {
    return { shouldNudge: false, reason: 'Check already in progress' };
  }

  return { shouldNudge: true, reason: 'OK' };
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
