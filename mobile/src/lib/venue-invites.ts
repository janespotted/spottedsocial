import * as Haptics from 'expo-haptics';
import { supabase } from './supabase';
import { fetchProfilesSafe } from './profiles';

export interface InviteFriend {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

/**
 * Send "X invited you to <venue>" notifications — port of the web
 * VenueInviteContext.sendInvites: batch RPC insert + best-effort push per
 * recipient. Demo friends are silently skipped (not in auth.users).
 * Returns true when the invites were recorded.
 */
export async function sendVenueInvites(
  senderId: string,
  venueName: string,
  friends: InviteFriend[]
): Promise<boolean> {
  if (friends.length === 0) return false;

  try {
    const profiles = await fetchProfilesSafe();
    const senderFirstName =
      profiles.find((p) => p.id === senderId)?.display_name?.split(' ')[0] || 'Someone';
    const demoIds = new Set(profiles.filter((p) => p.is_demo).map((p) => p.id));
    const realFriends = friends.filter((f) => !demoIds.has(f.id));

    if (realFriends.length === 0) {
      // All-demo selection (dev testing) — treat as success, nothing to write
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    }

    const message = `${senderFirstName} invited you to ${venueName}. Want to go?`;
    const { data: inserted, error } = await supabase.rpc('create_notifications_batch', {
      p_notifications: realFriends.map((f) => ({
        receiver_id: f.id,
        type: 'venue_invite',
        message,
      })),
    });
    if (error) throw error;

    for (const notification of inserted ?? []) {
      supabase.functions
        .invoke('send-push', {
          body: {
            notification_id: notification.id,
            receiver_id: notification.receiver_id,
            sender_id: senderId,
            type: 'venue_invite',
            message,
          },
        })
        .catch(() => {});
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch {
    return false;
  }
}
