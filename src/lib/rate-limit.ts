import { supabase } from '@/integrations/supabase/client';

export type RateLimitAction = 
  | 'venue_report'      // 10/hour
  | 'new_venue'         // 5/day
  | 'yap_message'       // 30/hour
  | 'post'              // 10/hour
  | 'yap_comment';      // 30/hour

const RATE_LIMITS: Record<RateLimitAction, { maxCount: number; windowHours: number }> = {
  venue_report: { maxCount: 10, windowHours: 1 },
  new_venue: { maxCount: 5, windowHours: 24 },
  yap_message: { maxCount: 30, windowHours: 1 },
  post: { maxCount: 10, windowHours: 1 },
  yap_comment: { maxCount: 30, windowHours: 1 },
};

/**
 * Checks rate limit and records the action if allowed.
 * Returns true if the action is allowed, false if rate limited.
 */
export async function checkAndRecordRateLimit(action: RateLimitAction): Promise<boolean> {
  const limit = RATE_LIMITS[action];
  
  const { data, error } = await supabase.rpc('record_rate_limited_action', {
    p_action_type: action,
    p_max_count: limit.maxCount,
    p_window_hours: limit.windowHours,
  });
  
  if (error) {
    console.error('Rate limit check failed:', error);
    // On error, allow the action to proceed (fail open for UX)
    return true;
  }
  
  return data === true;
}

/**
 * Gets a user-friendly message for rate limit exceeded.
 */
export function getRateLimitMessage(action: RateLimitAction): string {
  const limit = RATE_LIMITS[action];
  const timeUnit = limit.windowHours >= 24 ? 'day' : 'hour';
  
  switch (action) {
    case 'venue_report':
      return `You can only report ${limit.maxCount} venue issues per ${timeUnit}. Try again later.`;
    case 'new_venue':
      return `You can only add ${limit.maxCount} new venues per ${timeUnit}. Try again tomorrow.`;
    case 'yap_message':
      return `You can only post ${limit.maxCount} yaps per ${timeUnit}. Slow down!`;
    case 'post':
      return `You can only create ${limit.maxCount} posts per ${timeUnit}. Try again later.`;
    case 'yap_comment':
      return `You can only post ${limit.maxCount} comments per ${timeUnit}. Slow down!`;
    default:
      return 'Rate limit exceeded. Try again later.';
  }
}
