/**
 * Time context utilities for nightlife app
 * All ephemeral content expires at 5am local time
 * Supports both nightlife and day parties (brunch, day drinking, day clubs)
 */

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

/**
 * Check if a timestamp is from "tonight" (using 5am rollover)
 */
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
 * Get the current time context for the app
 */
export function getNightContext(): 'morning' | 'afternoon' | 'early-evening' | 'prime-time' | 'late-night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';        // 5am-11am (not active)
  if (hour >= 11 && hour < 15) return 'afternoon';     // 11am-3pm (day party hours)
  if (hour >= 15 && hour < 19) return 'early-evening'; // 3pm-7pm
  if (hour >= 19 || hour < 2) return 'prime-time';     // 7pm-2am
  return 'late-night'; // 2am-5am
}

/**
 * Get a friendly message based on time of day
 */
export function getTimeGreeting(): string {
  const context = getNightContext();
  switch (context) {
    case 'morning':
      return 'Planning to go out later?';
    case 'afternoon':
      return 'Going out today?';        // Day party friendly
    case 'early-evening':
      return 'Heading out today?';      // Transitional
    case 'prime-time':
      return 'Going out tonight?';      // Nightlife
    case 'late-night':
      return 'Still out?';
  }
}
