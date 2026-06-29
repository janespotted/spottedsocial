import type { SupportedCity } from './city-detection';

/**
 * Map city to IANA timezone.
 */
function cityToTimezone(city: SupportedCity): string {
  switch (city) {
    case 'la': return 'America/Los_Angeles';
    case 'nyc':
    case 'pb':
    default: return 'America/New_York';
  }
}

/**
 * Get the current hour in the user's city timezone.
 */
function getLocalHour(city: SupportedCity): number {
  const tz = cityToTimezone(city);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  return parseInt(parts.find(p => p.type === 'hour')!.value, 10);
}

/**
 * Build the "last night" window in UTC.
 * Window: previous day 5pm local → today 5am local.
 * All returned as ISO UTC strings.
 */
export function getMorningAfterWindow(city: SupportedCity): { start: string; end: string } {
  const now = new Date();
  const tz = cityToTimezone(city);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(now);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);

  // Build "today 5am local" as naive Date, derive UTC offset
  const localNow = new Date(`${year}-${month}-${day}T${String(hour).padStart(2, '0')}:00:00`);
  const offsetMs = now.getTime() - localNow.getTime();

  // Today's 5am local → UTC
  const fiveAmLocal = new Date(`${year}-${month}-${day}T05:00:00`);
  const fiveAmUTC = new Date(fiveAmLocal.getTime() + offsetMs);

  // Yesterday's 5pm local → UTC (12 hours before 5am)
  const fivePmUTC = new Date(fiveAmUTC.getTime() - 12 * 60 * 60 * 1000);

  return {
    start: fivePmUTC.toISOString(),
    end: fiveAmUTC.toISOString(),
  };
}

/**
 * Check if current local time is in the Morning After window (5am–3pm).
 */
export function isMorningAfterTime(city: SupportedCity): boolean {
  const hour = getLocalHour(city);
  return hour >= 5 && hour < 15;
}

/**
 * Format a UTC timestamp to a local time string like "10:32pm".
 */
export function formatLocalTime(utcTimestamp: string, city: SupportedCity): string {
  const tz = cityToTimezone(city);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcTimestamp)).toLowerCase();
}
