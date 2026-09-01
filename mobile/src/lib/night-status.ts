import { supabase } from './supabase';

const STATUS_CACHE_TTL_MS = 60_000;
let _cachedOutResult: { out: boolean; ts: number; userId: string } | null = null;

/**
 * Whether the user is currently "out" with an unexpired status.
 * Result is cached for 60s to avoid a query per background fix.
 * Always fails closed (returns false on error or null expires_at).
 * Port of the web app's night-status.ts.
 */
export async function isUserCurrentlyOut(userId: string): Promise<boolean> {
  const now = Date.now();
  if (
    _cachedOutResult &&
    _cachedOutResult.userId === userId &&
    now - _cachedOutResult.ts < STATUS_CACHE_TTL_MS
  ) {
    return _cachedOutResult.out;
  }
  try {
    const { data, error } = await supabase
      .from('night_statuses')
      .select('status, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      _cachedOutResult = { out: false, ts: now, userId };
      return false;
    }
    // Fail closed: require status='out' AND expires_at in the future
    const out =
      data.status === 'out' && !!data.expires_at && new Date(data.expires_at) > new Date();
    _cachedOutResult = { out, ts: now, userId };
    return out;
  } catch {
    _cachedOutResult = { out: false, ts: now, userId };
    return false;
  }
}

/** Drop the cache — call after any local status write so gates re-check immediately. */
export function invalidateOutStatusCache(): void {
  _cachedOutResult = null;
}
