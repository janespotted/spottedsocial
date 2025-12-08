import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * Triggers push notification via edge function
 * Called after inserting a notification into the database
 */
export async function triggerPushNotification(notification: {
  id: string;
  receiver_id: string;
  sender_id: string;
  type: string;
  message: string;
}): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: {
        notification_id: notification.id,
        receiver_id: notification.receiver_id,
        sender_id: notification.sender_id,
        type: notification.type,
        message: notification.message,
      },
    });

    if (error) {
      logger.warn('push:trigger_failed', { error: error.message, notification_id: notification.id });
    } else {
      logger.info('push:triggered', { notification_id: notification.id, type: notification.type });
    }
  } catch (err) {
    // Don't throw - push is best-effort, shouldn't break the main flow
    logger.error('push:trigger_error', { error: String(err) });
  }
}
