import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import { createDmThread } from './dm';

export type SendMeetUpResult =
  /** The card is in your 1:1 thread; Undo withdraws `inviteId`. */
  | { status: 'sent'; inviteId: string; threadId: string }
  | { status: 'failed'; message: string };

/**
 * Ask someone to meet up. The send_meetup RPC posts a Meet Up card into your
 * 1:1 thread (with the spot they're at, when you can already see it), saves
 * the request and queues its notification + push. There is no limit: the
 * client wants people free to ask again, so every send is its own card with
 * its own Accept / Decline (a double tap within 30 s returns the same one).
 * Everything dies at the 5 AM reset. Callers show /sent-confirmation on
 * `sent`; this only alerts on failure.
 */
export async function sendMeetUp(target: { user_id: string }): Promise<SendMeetUpResult> {
  try {
    const { data, error } = await supabase.rpc('send_meetup', { p_receiver: target.user_id });
    if (error) throw error;
    const row = data?.[0];
    if (row?.result !== 'sent' || !row.invite_id || !row.thread_id) {
      throw new Error('This person is no longer available for this request.');
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return { status: 'sent', inviteId: row.invite_id, threadId: row.thread_id };
  } catch (e) {
    // Supabase errors are not always Error instances; the server's own words
    // ("Meet ups open when Night Mode starts at 6 PM.") are what to show.
    const raw = e && typeof e === 'object' ? (e as { message?: unknown }).message : undefined;
    const message = typeof raw === 'string' && raw ? raw : 'try again';
    Alert.alert('Could not send meet up', message);
    return { status: 'failed', message };
  }
}

/**
 * Accept a meet-up request an older build sent (no `invite_id` in the
 * notification; web ActivityTab.handleAcceptMeetUp parity): notify the sender
 * they're on, clear the request notification, and open a DM thread together.
 * Requests with a card are answered with respondToInvite in lib/dm-invites.ts.
 */
export async function acceptMeetUp(
  currentUserId: string,
  senderId: string,
  notificationId: string
): Promise<string | null> {
  return acceptInviteNotification(currentUserId, senderId, notificationId, 'meetup_accepted');
}

/**
 * Accept a venue invite sent before invites became DM cards (no `invite_id`
 * in the notification). New invites are answered with respondToInvite in
 * lib/dm-invites.ts; this path only serves rows left from older builds.
 */
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
    if (!notif?.id) throw new Error('This person is no longer available for this request.');
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
