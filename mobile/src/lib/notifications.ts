import { supabase } from './supabase';
import { fetchProfilesSafe } from './profiles';
import type { FeedPost } from '@/hooks/use-feed';

/**
 * Notify a post's owner about a like: create_notification RPC (in-app row)
 * then the send-push edge function (APNs). Port of the web toggleLike side
 * effect. Fire-and-forget — failures must never affect the like itself.
 */
export async function notifyPostLike(post: FeedPost, likerId: string): Promise<void> {
  try {
    if (post.user_id === likerId) return;

    const profiles = await fetchProfilesSafe();
    const liker = profiles.find((p) => p.id === likerId);
    const owner = profiles.find((p) => p.id === post.user_id);
    if (owner?.is_demo) return; // demo users don't get notifications

    const likerName = liker?.display_name?.split(' ')[0] || 'Someone';
    const message = `${likerName} liked your post${post.venue_name ? ` at ${post.venue_name}` : ''}`;

    const { data } = await supabase.rpc('create_notification', {
      p_receiver_id: post.user_id,
      p_type: 'post_like',
      p_message: message,
    });
    const notif = Array.isArray(data) ? data[0] : data;
    if (!notif?.id) return;

    await supabase.functions.invoke('send-push', {
      body: {
        notification_id: notif.id,
        receiver_id: post.user_id,
        sender_id: likerId,
        type: 'post_like',
        message,
      },
    });
  } catch {
    /* never let notification failures surface */
  }
}

/** Shared "create in-app row + push" helper for the plan notifications below. */
async function createAndPush(
  receiverId: string,
  senderId: string,
  type: string,
  message: string
): Promise<void> {
  const { data } = await supabase.rpc('create_notification', {
    p_receiver_id: receiverId,
    p_type: type,
    p_message: message,
  });
  const notif = Array.isArray(data) ? data[0] : data;
  if (!notif?.id) return;

  await supabase.functions.invoke('send-push', {
    body: {
      notification_id: notif.id,
      receiver_id: receiverId,
      sender_id: senderId,
      type,
      message,
    },
  });
}

/**
 * Notify a plan's creator that someone is down. Port of the web
 * PlanItem.handleToggleDown side effect. Fire-and-forget.
 */
export async function notifyPlanDown(
  plan: { id: string; user_id: string; venue_name: string; user?: { is_demo: boolean } },
  senderId: string
): Promise<void> {
  try {
    if (plan.user_id === senderId) return;
    if (plan.user?.is_demo) return; // demo users aren't in auth.users

    const profiles = await fetchProfilesSafe();
    const senderName =
      profiles.find((p) => p.id === senderId)?.display_name?.split(' ')[0] || 'Someone';
    const message = `${senderName} is down for your plan at ${plan.venue_name}! 🎉`;
    await createAndPush(plan.user_id, senderId, 'plan_down', message);
  } catch {
    /* never let notification failures surface */
  }
}

/**
 * Notify friends the creator tagged on a new plan. Port of the web
 * CreatePlanDialog invite loop. Fire-and-forget.
 */
export async function notifyPlanInvites(
  friendIds: string[],
  senderId: string,
  venueName: string
): Promise<void> {
  try {
    const profiles = await fetchProfilesSafe();
    const senderName = profiles.find((p) => p.id === senderId)?.display_name || 'Someone';
    const message = `${senderName} invited you to their plans at ${venueName}`;

    await Promise.all(
      friendIds
        // demo users aren't in auth.users — the notification FK would fail
        .filter((id) => !profiles.find((p) => p.id === id)?.is_demo)
        .map((id) => createAndPush(id, senderId, 'plan_invite', message))
    );
  } catch {
    /* never let notification failures surface */
  }
}

/* ── Check-in notifications (port of web fomo-notifications + CheckInModal) ── */

// Session-scoped rate limits (web used localStorage; per-launch is fine here)
const rateLimits = new Map<string, number>();
function rateLimited(key: string, windowMs: number): boolean {
  const last = rateLimits.get(key) ?? 0;
  if (Date.now() - last < windowMs) return true;
  rateLimits.set(key, Date.now());
  return false;
}

/**
 * "X just got to Venue. N others already there." — push to friends who can
 * see the sender's location and aren't already at the venue. Max 20
 * recipients, once per venue per 30 min per recipient. Fire-and-forget.
 */
export async function notifyFriendArrived(
  userId: string,
  displayName: string,
  venueId: string,
  venueName: string
): Promise<void> {
  try {
    const [sent, received] = await Promise.all([
      supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
      supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
    ]);
    const allFriendIds = [
      ...new Set([
        ...(sent.data?.map((f) => f.friend_id) ?? []),
        ...(received.data?.map((f) => f.user_id) ?? []),
      ]),
    ];
    if (allFriendIds.length === 0) return;

    // Privacy filter: only friends who can see the sender's location
    const { data: visibleIds } = await (
      supabase.rpc as (fn: string, args: object) => PromiseLike<{ data: unknown }>
    )('get_visible_recipients', { candidate_ids: allFriendIds });
    const friendIds = (visibleIds ?? []) as string[];
    if (friendIds.length === 0) return;

    const nowIso = new Date().toISOString();
    const { count: othersCount } = await supabase
      .from('night_statuses')
      .select('user_id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .eq('status', 'out')
      .neq('user_id', userId)
      .not('expires_at', 'is', null)
      .gt('expires_at', nowIso);
    const othersText =
      othersCount && othersCount > 0
        ? ` ${othersCount} ${othersCount === 1 ? 'other' : 'others'} already there.`
        : '';
    const message = `${displayName} just got to ${venueName}.${othersText}`;

    // Don't spam friends already at this venue
    const { data: friendsAtVenue } = await supabase
      .from('night_statuses')
      .select('user_id')
      .in('user_id', friendIds)
      .eq('venue_id', venueId)
      .eq('status', 'out');
    const atVenue = new Set((friendsAtVenue ?? []).map((f) => f.user_id));

    for (const friendId of friendIds.filter((id) => !atVenue.has(id)).slice(0, 20)) {
      if (rateLimited(`fomo_arrived_${friendId}_${venueId}`, 30 * 60 * 1000)) continue;
      await createAndPush(friendId, userId, 'friend_arrived', message);
    }
  } catch {
    /* never let notification failures surface */
  }
}

/**
 * "X is deciding where to go tonight" — audience-tiered planning ping with a
 * 30-minute dedup against the notifications table. Port of the CheckInModal
 * planning branch. Fire-and-forget.
 */
export async function notifyFriendsPlanning(
  userId: string,
  visibility: 'close_friends' | 'all_friends' | 'mutual_friends' | null
): Promise<void> {
  try {
    const dedupCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('sender_id', userId)
      .eq('type', 'friend_planning')
      .gte('created_at', dedupCutoff)
      .limit(1);
    if (existing && existing.length > 0) return;

    const effective = visibility ?? 'all_friends';
    let recipientIds: string[] = [];
    if (effective === 'close_friends') {
      const { data: close } = await supabase
        .from('close_friends')
        .select('close_friend_id')
        .eq('user_id', userId);
      recipientIds = (close ?? []).map((c) => c.close_friend_id);
    } else {
      const { data: friendships } = await supabase
        .from('friendships')
        .select('user_id, friend_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');
      if (effective === 'all_friends') {
        recipientIds = (friendships ?? []).map((f) =>
          f.user_id === userId ? f.friend_id : f.user_id
        );
      } else {
        const sentTo = new Set<string>();
        const receivedFrom = new Set<string>();
        for (const f of friendships ?? []) {
          if (f.user_id === userId) sentTo.add(f.friend_id);
          else receivedFrom.add(f.user_id);
        }
        recipientIds = [...sentTo].filter((id) => receivedFrom.has(id));
      }
    }
    if (recipientIds.length === 0) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    const firstName = profile?.display_name?.split(' ')[0] || 'A friend';
    const message = `${firstName} is deciding where to go tonight`;

    await Promise.allSettled(
      recipientIds.map((id) => createAndPush(id, userId, 'friend_planning', message))
    );
  } catch {
    /* never let notification failures surface */
  }
}
