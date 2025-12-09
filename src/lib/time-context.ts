/**
 * Time context utilities for nightlife app
 * All ephemeral content expires at 5am local time
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
 * Check if current time is during nightlife hours
 * Nightlife hours: 5pm (17:00) to 5am (05:00)
 */
export function isNightlifeHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 17 || hour < 5;
}

/**
 * Get the current time context for the app
 */
export function getNightContext(): 'daytime' | 'early-evening' | 'prime-time' | 'late-night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 17) return 'daytime';
  if (hour >= 17 && hour < 21) return 'early-evening';
  if (hour >= 21 || hour < 2) return 'prime-time';
  return 'late-night'; // 2am - 5am
}

/**
 * Get a friendly message based on time of day
 */
export function getTimeGreeting(): string {
  const context = getNightContext();
  switch (context) {
    case 'daytime':
      return 'Planning tonight?';
    case 'early-evening':
      return 'Where are you heading?';
    case 'prime-time':
      return 'Are you out?';
    case 'late-night':
      return 'Still out?';
  }
}
