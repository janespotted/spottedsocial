import { supabase } from '@/integrations/supabase/client';
import { triggerPushNotification } from '@/lib/push-notifications';

/**
 * Sends venue-aware notifications when a user checks in.
 *
 * 1. "Friend arrived at your venue" — notifies friends already at the same venue.
 * 2. "X friends are at [venue]" — when 3+ friends are at a venue, notifies
 *    friends NOT at that venue (once per venue per night per recipient).
 *
 * Replaces the old broadcast-to-all-friends pattern.
 */
export async function sendCheckinNotifications(
  userId: string,
  venueId: string,
  venueName: string,
): Promise<void> {
  try {
    // 1. Get accepted friends (both directions)
    const { data: friendships } = await supabase
      .from('friendships')
      .select('user_id, friend_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (!friendships?.length) return;

    const friendIds = friendships.map(f =>
      f.user_id === userId ? f.friend_id : f.user_id
    );

    // 2. Get current user's display name
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single();

    const displayName = profile?.display_name || 'A friend';

    // 3. Find friends currently checked in at THIS venue
    const { data: friendsAtVenue } = await supabase
      .from('checkins')
      .select('user_id')
      .in('user_id', friendIds)
      .eq('venue_id', venueId)
      .is('ended_at', null);

    const friendIdsAtVenue = new Set(
      (friendsAtVenue || []).map(c => c.user_id)
    );

    // 4. "Friend arrived at your venue" — notify friends already here
    const arrivedMessage = `${displayName} just arrived at ${venueName} 👀`;
    for (const friendId of friendIdsAtVenue) {
      supabase.rpc('create_notification', {
        p_receiver_id: friendId,
        p_type: 'friend_arrived_venue',
        p_message: arrivedMessage,
      }).then(({ data, error }) => {
        if (error) {
          console.warn('friend_arrived_venue notification failed:', error.message);
          return;
        }
        const notif = Array.isArray(data) ? data[0] : data;
        if (notif?.id) {
          triggerPushNotification({
            id: notif.id,
            receiver_id: friendId,
            sender_id: userId,
            type: 'friend_arrived_venue',
            message: arrivedMessage,
          });
        }
      }).catch(err => console.warn('friend_arrived_venue push failed:', err));
    }

    // 5. "X friends are at [venue]" — if 3+ friends at venue, notify others
    //    Count includes the user who just checked in
    const totalAtVenue = friendIdsAtVenue.size + 1; // +1 for the current user
    if (totalAtVenue >= 3) {
      const friendsNotAtVenue = friendIds.filter(id => !friendIdsAtVenue.has(id));
      if (friendsNotAtVenue.length === 0) return;

      // Check throttle: only send once per venue per night per recipient
      const today = new Date().toISOString().split('T')[0];
      const { data: alreadyNotified } = await supabase
        .from('venue_notif_throttle')
        .select('user_id')
        .eq('venue_id', venueId)
        .eq('notified_date', today)
        .in('user_id', friendsNotAtVenue);

      const alreadyNotifiedSet = new Set(
        (alreadyNotified || []).map(r => r.user_id)
      );

      const recipientIds = friendsNotAtVenue.filter(
        id => !alreadyNotifiedSet.has(id)
      );

      if (recipientIds.length === 0) return;

      // Count how many of THIS user's friends are at the venue (not total strangers)
      const friendCountAtVenue = friendIdsAtVenue.size + 1; // friends + user
      const hotVenueMessage = `${friendCountAtVenue} of your friends are at ${venueName} 🔥`;

      // Insert throttle records
      const throttleRows = recipientIds.map(uid => ({
        user_id: uid,
        venue_id: venueId,
        notified_date: today,
      }));
      await supabase.from('venue_notif_throttle').insert(throttleRows);

      // Send notifications
      for (const friendId of recipientIds) {
        supabase.rpc('create_notification', {
          p_receiver_id: friendId,
          p_type: 'friends_at_venue',
          p_message: hotVenueMessage,
        }).then(({ data, error }) => {
          if (error) {
            console.warn('friends_at_venue notification failed:', error.message);
            return;
          }
          const notif = Array.isArray(data) ? data[0] : data;
          if (notif?.id) {
            triggerPushNotification({
              id: notif.id,
              receiver_id: friendId,
              sender_id: userId,
              type: 'friends_at_venue',
              message: hotVenueMessage,
            });
          }
        }).catch(err => console.warn('friends_at_venue push failed:', err));
      }
    }
  } catch (err) {
    console.warn('Checkin notifications failed:', err);
  }
}
