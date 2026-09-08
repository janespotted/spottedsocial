import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import { fetchProfilesSafe } from './profiles';

/**
 * Send a "wants to meet up" notification. Lean port of the web
 * MeetUpContext.sendMeetUpNotification: 5-minute dedupe, create_notification
 * RPC, push via send-push. (Web also refreshes GPS here; that rides on the
 * location-service port and is best-effort there too.)
 */
export async function sendMeetUp(
  senderId: string,
  target: { user_id: string; display_name: string }
): Promise<void> {
  try {
    const profiles = await fetchProfilesSafe();
    const targetProfile = profiles.find((p) => p.id === target.user_id);

    // Demo friends can't receive anything real — confirm optimistically in dev
    if (targetProfile?.is_demo) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Meet up sent!', `${target.display_name} will get a ping. (demo)`);
      return;
    }

    // Anti-spam: one unread meetup_request per recipient per 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('notifications')
      .select('id')
      .eq('sender_id', senderId)
      .eq('receiver_id', target.user_id)
      .eq('type', 'meetup_request')
      .eq('is_read', false)
      .gte('created_at', fiveMinutesAgo);
    if (recent?.length) {
      Alert.alert('Already sent', `You just sent a meet up to ${target.display_name}.`);
      return;
    }

    const senderName = profiles.find((p) => p.id === senderId)?.display_name ?? 'Someone';
    const message = `${senderName.split(' ')[0]} wants to meet up with you`;

    const { data, error } = await supabase.rpc('create_notification', {
      p_receiver_id: target.user_id,
      p_type: 'meetup_request',
      p_message: message,
    });
    if (error) throw error;

    const notif = Array.isArray(data) ? data[0] : data;
    if (notif?.id) {
      supabase.functions
        .invoke('send-push', {
          body: {
            notification_id: notif.id,
            receiver_id: target.user_id,
            sender_id: senderId,
            type: 'meetup_request',
            message,
          },
        })
        .catch(() => {});
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Meet up sent!', `${target.display_name} will get a ping.`);
  } catch (e) {
    Alert.alert('Could not send meet up', e instanceof Error ? e.message : 'try again');
  }
}
