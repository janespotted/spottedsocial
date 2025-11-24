/**
 * Calculate the expiry time for ephemeral content (5 AM next morning)
 * All posts, statuses, and yap messages expire at 5 AM local time
 */
export function calculateExpiryTime(): string {
  const now = new Date();
  const tomorrow = new Date(now);
  
  // If it's before 5 AM, expire at 5 AM today
  // Otherwise, expire at 5 AM tomorrow
  if (now.getHours() < 5) {
    tomorrow.setHours(5, 0, 0, 0);
  } else {
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(5, 0, 0, 0);
  }
  
  return tomorrow.toISOString();
}

/**
 * Check if a timestamp has expired (past 5 AM)
 */
export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) <= new Date();
}
