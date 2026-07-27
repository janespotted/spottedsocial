import { getStatusExpiry } from './night-status';

/**
 * Alias kept to avoid a wide rename — delegates to the canonical
 * implementation in night-status.ts which uses the user's city timezone.
 */
export const calculateExpiryTime = getStatusExpiry;

/**
 * Check if a timestamp has expired (past 5 AM)
 */
export function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) <= new Date();
}
