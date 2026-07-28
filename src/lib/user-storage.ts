/**
 * User-scoped localStorage helpers.
 * Prefixes keys with userId so logout/login on a shared device
 * doesn't inherit the previous user's venue prompts.
 */

const SCOPED_KEYS = [
  'still_here_check',
  'still_here_venue',
  'still_here_deadline',
  'checkin_reminder',
  'venue_arrival_planning_payload',
] as const;

type ScopedKey = typeof SCOPED_KEYS[number];

function scopedKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}

export function getUserItem(userId: string, key: ScopedKey): string | null {
  return localStorage.getItem(scopedKey(userId, key));
}

export function setUserItem(userId: string, key: ScopedKey, value: string): void {
  localStorage.setItem(scopedKey(userId, key), value);
}

export function removeUserItem(userId: string, key: ScopedKey): void {
  localStorage.removeItem(scopedKey(userId, key));
}

/**
 * For passive_venue_nudge_* keys which have dynamic suffixes.
 */
export function getPassiveNudgeKey(userId: string, venueId: string): string {
  return `${userId}:passive_venue_nudge_${venueId}`;
}
