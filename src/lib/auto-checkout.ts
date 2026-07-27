import { logEvent } from '@/lib/event-logger';
import { stopSharing } from '@/lib/night-status';

/**
 * Shared utility to auto-checkout a user.
 * Delegates all cleanup to `stopSharing` (WP2) and logs the reason.
 */
export async function performAutoCheckout(userId: string, reason: string = 'still_here_no_response') {
  await stopSharing(userId);
  logEvent('auto_checkout_stale' as any, { reason });
}
