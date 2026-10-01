import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import { createDmThread } from './dm';
import { fetchProfilesSafe } from './profiles';
import { nightStartAt } from './tonight';

/**
 * Send a "wants to meet up" notification. Lean port of the web
 * MeetUpContext.sendMeetUpNotification: 5-minute dedupe, create_notification
 * RPC, push via send-push. (Web also refreshes GPS here; that rides on the
 * location-service port and is best-effort there too.)
 */
export type SendMeetUpResult =
  | { status: 'sent'; notificationId: string | null }
  /** A request from either side is still waiting for an answer tonight. */
  | { status: 'duplicate' }
  /** They already accepted tonight — there is nothing left to ask. */
  | { status: 'already_met' }
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

    if (targetProfile?.is_demo) throw new Error('Demo profiles cannot receive requests.');

    // One meet-up per pair per night, in EITHER direction, and none once
    // they have already agreed. The old guard only caught an *unread*
    // request under five minutes old, so accepting it (which deletes the
    // row) or simply opening Activity (which marks it read) let the sender
    // fire again immediately — unlimited meet ups between the same two
    // people. Everything here dies at the 5 AM reset with the rest of the
    // night, so tomorrow starts fresh.
    const nightStart = nightStartAt().toISOString();
    const pair = `and(sender_id.eq.${senderId},receiver_id.eq.${target.user_id}),and(sender_id.eq.${target.user_id},receiver_id.eq.${senderId})`;
    const { data: existing } = await supabase
      .from('notifications')
      .select('id, type, sender_id')
      .or(pair)
      .in('type', ['meetup_request', 'meetup_accepted'])
      .gte('created_at', nightStart);
    if (existing?.length) {
      // Already on together, or a request is still waiting for an answer.
      const accepted = existing.some((n) => n.type === 'meetup_accepted');
      return { status: accepted ? 'already_met' : 'duplicate' };
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
    if (!notif?.id) throw new Error('This person is no longer available for this request.');
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
 * Undo tonight's meet up with someone — the request, their acceptance, or
 * both. Without this the once-per-night rule was a trap: a mistaken tap,
 * or plans that changed, left the pair locked out until 5 AM with nothing
 * to undo it. Deletes in both directions so either person can clear it.
 */
export async function cancelMeetUp(currentUserId: string, otherUserId: string): Promise<void> {
  const pair = `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`;
  const { data: existing, error: readError } = await supabase.from('notifications').select('id').or(pair)
    .in('type', ['meetup_request', 'meetup_accepted']).gte('created_at', nightStartAt().toISOString());
  if (readError || !existing?.length) throw new Error('Could not confirm the request. Refresh and try again.');
  const ids = existing.map(n => n.id);
  const { data, error } = await supabase.from('notifications').delete().in('id', ids).select('id');
  if (error || data?.length !== ids.length) throw new Error('Could not cancel every request. One may already have been read or handled.');

}

/** Is there a meet up between these two tonight, and has it been accepted? */
export async function fetchMeetUpState(
  currentUserId: string,
  otherUserId: string
): Promise<'none' | 'pending' | 'accepted'> {
  const pair = `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`;
  const { data } = await supabase
    .from('notifications')
    .select('type')
    .or(pair)
    .in('type', ['meetup_request', 'meetup_accepted'])
    .gte('created_at', nightStartAt().toISOString());
  if (!data?.length) return 'none';
  return data.some((n) => n.type === 'meetup_accepted') ? 'accepted' : 'pending';
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
