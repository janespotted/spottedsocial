import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import { createDmThread } from './dm';
import { fetchProfilesSafe } from './profiles';

/**
 * Send a "wants to meet up" notification. Lean port of the web
 * MeetUpContext.sendMeetUpNotification: 5-minute dedupe, create_notification
 * RPC, push via send-push. (Web also refreshes GPS here; that rides on the
 * location-service port and is best-effort there too.)
 */
export type SendMeetUpResult =
  | { status: 'sent'; notificationId: string | null }
  | { status: 'duplicate' }
  | { status: 'failed'; message: string };

/**
 * Callers show the confirmation card (/sent-confirmation) on `sent`; this
 * only alerts on failure. `notificationId` is what Undo deletes.
 */
export async function sendMeetUp(
  senderId: string,
  target: { user_id: string; display_name: string }
): Promise<SendMeetUpResult> {
  try {
    const profiles = await fetchProfilesSafe();
    const targetProfile = profiles.find((p) => p.id === target.user_id);

    // Demo friends can't receive anything real — confirm optimistically in dev
    if (targetProfile?.is_demo) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return { status: 'sent', notificationId: null };
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
    if (recent?.length) return { status: 'duplicate' };

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
    return { status: 'sent', notificationId: notif?.id ?? null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'try again';
    Alert.alert('Could not send meet up', message);
    return { status: 'failed', message };
  }
}

/**
 * Accept a meet-up request (web ActivityTab.handleAcceptMeetUp parity):
 * notify the sender they're on, clear the request notification, and open a
 * DM thread together. Returns the thread id for navigation, null on failure.
 */
export async function acceptMeetUp(
  currentUserId: string,
  senderId: string,
  notificationId: string
): Promise<string | null> {
  return acceptInviteNotification(currentUserId, senderId, notificationId, 'meetup_accepted');
}

/** Accept a venue invite (web handleAcceptVenueInvite parity). */
export async function acceptVenueInvite(
  currentUserId: string,
  senderId: string,
  notificationId: string,
  inviteMessage: string
): Promise<string | null> {
  const venue = inviteMessage.match(/invited you to (.+?)\. Want to go\?/)?.[1] ?? null;
  return acceptInviteNotification(
    currentUserId,
    senderId,
    notificationId,
    'venue_invite_accepted',
    venue
  );
}

async function acceptInviteNotification(
  currentUserId: string,
  senderId: string,
  notificationId: string,
  acceptedType: 'meetup_accepted' | 'venue_invite_accepted',
  venueName?: string | null
): Promise<string | null> {
  try {
    const { data: me } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', currentUserId)
      .maybeSingle();
    const myName = me?.display_name?.split(' ')[0] ?? 'Someone';
    const message =
      acceptedType === 'venue_invite_accepted'
        ? `${myName} is down for ${venueName ?? 'it'}! 🎉`
        : `${myName} is down to meet up! 🎉`;

    const { data, error } = await supabase.rpc('create_notification', {
      p_receiver_id: senderId,
      p_type: acceptedType,
      p_message: message,
    });
    if (error) throw error;
    const notif = Array.isArray(data) ? data[0] : data;
    if (notif?.id) {
      supabase.functions
        .invoke('send-push', {
          body: {
            notification_id: notif.id,
            receiver_id: senderId,
            sender_id: currentUserId,
            type: acceptedType,
            message,
          },
        })
        .catch(() => {});
    }

    // Clear the request so it doesn't reappear as actionable
    await supabase.from('notifications').delete().eq('id', notificationId);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return await createDmThread(senderId);
  } catch {
    return null;
  }
}
