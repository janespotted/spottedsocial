/** Direct port of the web src/lib/time-context.ts (pure functions). */

/**
 * Get the "night date" - accounts for 5am rollover
 * If it's before 5am, we're still in "last night"
 */
export function getNightDate(date: Date = new Date()): string {
  const d = new Date(date);
  if (d.getHours() < 5) {
    d.setDate(d.getDate() - 1);
  }
  return d.toDateString();
}

/** Check if a timestamp is from "tonight" (using 5am rollover) */
export function isFromTonight(timestamp: string | Date | null): boolean {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  return getNightDate(date) === getNightDate(new Date());
}

/**
 * Check if current time is during active hours
 * Active hours: 11am to 5am (supports day parties + nightlife)
 */
export function isNightlifeHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 11 || hour < 5; // 11am to 5am
}

/**
 * Check if a location timestamp is "fresh" — from tonight and less than 2 hours old.
 * Shared predicate so Map, Leaderboard, and venue surfaces agree.
 */
export function isFreshLocation(timestamp: string | Date | null): boolean {
  if (!timestamp) return false;
  if (!isFromTonight(timestamp)) return false;
  const age = Date.now() - new Date(timestamp).getTime();
  return age < 2 * 60 * 60 * 1000;
}
