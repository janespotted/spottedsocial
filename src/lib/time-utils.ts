/**
 * Calculate the expiry time for ephemeral content (5 AM Eastern Time).
 * Returns the next 5:00 AM ET as a UTC ISO string, regardless of the
 * user's browser timezone. Uses Intl to derive the current ET offset
 * so it handles EST (UTC-5) and EDT (UTC-4) automatically.
 */
export function calculateExpiryTime(): string {
  const now = new Date();

  // Derive the current ET UTC offset by comparing formatted ET time to real UTC
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = etFormatter.formatToParts(now);
  const etYear = parts.find(p => p.type === 'year')!.value;
  const etMonth = parts.find(p => p.type === 'month')!.value;
  const etDay = parts.find(p => p.type === 'day')!.value;
  const etHour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
  const etMinute = parts.find(p => p.type === 'minute')!.value;
  const etSecond = parts.find(p => p.type === 'second')!.value;

  // Build the ET "now" as a naive Date (no TZ), then diff against real UTC to get offset
  const etNowLocal = new Date(
    `${etYear}-${etMonth}-${etDay}T${String(etHour).padStart(2, '0')}:${etMinute}:${etSecond}`
  );
  const offsetMs = now.getTime() - etNowLocal.getTime();

  // Build 5:00 AM ET today (naive), then convert to UTC
  const fiveAmETLocal = new Date(`${etYear}-${etMonth}-${etDay}T05:00:00`);
  let fiveAmUTC = new Date(fiveAmETLocal.getTime() + offsetMs);

  // If it's already past 5 AM ET, target tomorrow's 5 AM ET
  if (now >= fiveAmUTC) {
    fiveAmUTC = new Date(fiveAmUTC.getTime() + 86400000);
  }

  return fiveAmUTC.toISOString();
}

/**
 * Check if a timestamp has expired (past 5 AM)
 */
export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) <= new Date();
}
