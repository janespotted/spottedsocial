import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

// Write a debug log to the database so we can see what's happening on TestFlight
async function pushDebugLog(stage: string, detail: Record<string, unknown>) {
  try {
    await supabase.from('push_logs').insert([{ stage, detail: detail as unknown as import('@/integrations/supabase/types').Json }]);
  } catch {
    // ignore - table might not exist yet
  }
}

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
    // Check auth session first
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

    await pushDebugLog('invoke_start', {
      notification_id: notification.id,
      receiver_id: notification.receiver_id,
      sender_id: notification.sender_id,
      type: notification.type,
      has_session: !!session,
      supabase_url: supabaseUrl.slice(0, 30),
    });

    if (!session) {
      await pushDebugLog('invoke_skip_no_session', { notification_id: notification.id });
      logger.warn('push:no_session', { notification_id: notification.id });
      return;
    }

    // Try supabase.functions.invoke first
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        notification_id: notification.id,
        receiver_id: notification.receiver_id,
        sender_id: notification.sender_id,
        type: notification.type,
        message: notification.message,
      },
    });

    if (error) {
      await pushDebugLog('invoke_error', {
        notification_id: notification.id,
        error: error.message,
        context: String(error.context || ''),
      });

      // Fallback: try raw fetch in case supabase client has CORS issues
      try {
        const functionUrl = `${supabaseUrl}/functions/v1/send-push`;
        const res = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          },
          body: JSON.stringify({
            notification_id: notification.id,
            receiver_id: notification.receiver_id,
            sender_id: notification.sender_id,
            type: notification.type,
            message: notification.message,
          }),
        });

        const resText = await res.text();
        await pushDebugLog('fetch_fallback', {
          notification_id: notification.id,
          status: res.status,
          ok: res.ok,
          body: resText.slice(0, 200),
        });
      } catch (fetchErr) {
        await pushDebugLog('fetch_fallback_error', {
          notification_id: notification.id,
          error: String(fetchErr),
        });
      }
    } else {
      await pushDebugLog('invoke_success', {
        notification_id: notification.id,
        response: data,
      });
      logger.info('push:triggered', { notification_id: notification.id, type: notification.type });
    }
  } catch (err) {
    await pushDebugLog('invoke_exception', {
      notification_id: notification.id,
      error: String(err),
    });
    logger.error('push:trigger_error', { error: String(err) });
  }
}
