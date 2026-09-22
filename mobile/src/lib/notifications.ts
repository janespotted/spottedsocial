import { supabase } from './supabase';
import { fetchProfilesSafe } from './profiles';

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

/** Compatibility shims. Source status writes now create these alerts in the
 * same database transaction, including automatic GPS transitions. */
export async function notifyFriendArrived(_userId: string, _displayName: string, _venueId: string, _venueName: string): Promise<void> {}
export async function notifyFriendsPlanning(_userId: string, _visibility: 'close_friends' | 'all_friends' | 'mutual_friends' | null): Promise<void> {}
