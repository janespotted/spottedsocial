import { supabase } from '@/integrations/supabase/client';
import { triggerPushNotification } from './push-notifications';

/**
 * FOMO-driving notifications that encourage check-ins and app engagement.
 *
 * 1. friendsOutWithoutYou — 3+ friends out, user hasn't checked in
 * 2. friendJustArrived — real-time friend arrival at a venue
 * 3. venueIsBuzzing — venue hits a check-in threshold
 * 4. weekendPregameNudge — Friday/Saturday evening nudge
 * 5. profileViewed — someone viewed your profile
 * 6. groupIsForming — 2+ friends planning the same area
 * 7. topVenueTonight — #1 venue on leaderboard is popping
 */

// ── Helpers ──

async function getFriendIds(userId: string): Promise<string[]> {
  const [sent, recv] = await Promise.all([
    supabase.from('friendships').select('friend_id').eq('user_id', userId).eq('status', 'accepted'),
    supabase.from('friendships').select('user_id').eq('friend_id', userId).eq('status', 'accepted'),
  ]);
  return [
    ...(sent.data?.map(f => f.friend_id) || []),
    ...(recv.data?.map(f => f.user_id) || []),
  ];
}

function rateLimited(key: string, cooldownMs: number): boolean {
  const last = localStorage.getItem(key);
  if (last && Date.now() - parseInt(last) < cooldownMs) return true;
  localStorage.setItem(key, String(Date.now()));
  return false;
}

// ── 1. Friends out without you ──
// Trigger: on a timer (10-11pm), or on background location update
// "5 of your friends are out tonight. You're missing out."

export async function checkFriendsOutWithoutYou(userId: string): Promise<void> {
  if (rateLimited('fomo_friends_out', 4 * 60 * 60 * 1000)) return; // max once per 4 hours

  try {
    // Check if user is already out
    const { data: userStatus } = await supabase
      .from('night_statuses')
      .select('status')
      .eq('user_id', userId)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (userStatus?.status === 'out') return; // already out

    const friendIds = await getFriendIds(userId);
    if (friendIds.length === 0) return;

    // Count friends who are out
    const { count } = await supabase
      .from('night_statuses')
      .select('user_id', { count: 'exact', head: true })
      .in('user_id', friendIds)
      .eq('status', 'out')
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    if (!count || count < 3) return;

    triggerPushNotification({
      id: `friends_out_${userId}_${Date.now()}`,
      receiver_id: userId,
      sender_id: userId,
      type: 'friends_out_fomo',
      message: `${count} of your friends are out tonight. You're missing out.`,
    });
  } catch (err) {
    console.error('[FOMO:FriendsOut] Error:', err);
  }
}

// ── 2. Friend just arrived ──
// Trigger: when a friend checks in (called from checkin flow)
// "Skyler just got to The Dresden. 2 others already there."

export async function notifyFriendArrived(
  userId: string,
  displayName: string,
  venueId: string,
  venueName: string,
): Promise<void> {
  try {
    const friendIds = await getFriendIds(userId);
    if (friendIds.length === 0) return;

    // Count others at this venue (excluding the arriving user)
    const { count: othersCount } = await supabase
      .from('night_statuses')
      .select('user_id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .eq('status', 'out')
      .neq('user_id', userId)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    const othersText = othersCount && othersCount > 0
      ? ` ${othersCount} ${othersCount === 1 ? 'other' : 'others'} already there.`
      : '';

    const message = `${displayName} just got to ${venueName}.${othersText}`;

    // Notify friends who are NOT at this venue (don't spam people already there)
    const { data: friendsAtVenue } = await supabase
      .from('night_statuses')
      .select('user_id')
      .in('user_id', friendIds)
      .eq('venue_id', venueId)
      .eq('status', 'out');

    const atVenueSet = new Set((friendsAtVenue || []).map(f => f.user_id));
    const toNotify = friendIds.filter(id => !atVenueSet.has(id));

    // Limit to 20 friends to avoid spam
    for (const friendId of toNotify.slice(0, 20)) {
      const key = `fomo_arrived_${friendId}_${venueId}`;
      if (rateLimited(key, 30 * 60 * 1000)) continue; // max once per venue per 30 min per recipient

      triggerPushNotification({
        id: `friend_arrived_${userId}_${friendId}_${Date.now()}`,
        receiver_id: friendId,
        sender_id: userId,
        type: 'friend_arrived',
        message,
      });
    }
  } catch (err) {
    console.error('[FOMO:FriendArrived] Error:', err);
  }
}

// ── 3. Venue is buzzing ──
// Trigger: when a venue crosses a check-in threshold
// "Sound Nightclub is buzzing — 12 people checked in right now."

export async function checkVenueBuzzing(venueId: string, venueName: string): Promise<void> {
  try {
    // Count current check-ins at this venue
    const { count } = await supabase
      .from('night_statuses')
      .select('user_id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .eq('status', 'out')
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    if (!count || count < 5) return; // threshold: 5+ people

    const key = `fomo_buzzing_${venueId}`;
    if (rateLimited(key, 2 * 60 * 60 * 1000)) return; // max once per 2 hours per venue

    // Find users who have been to this venue before but aren't there now
    const { data: pastVisitors } = await supabase
      .from('checkins')
      .select('user_id')
      .eq('venue_id', venueId)
      .gt('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // last 30 days
      .limit(50);

    if (!pastVisitors?.length) return;

    // Exclude users currently at the venue
    const { data: currentlyThere } = await supabase
      .from('night_statuses')
      .select('user_id')
      .eq('venue_id', venueId)
      .eq('status', 'out');

    const thereSet = new Set((currentlyThere || []).map(u => u.user_id));
    const uniqueVisitors = [...new Set(pastVisitors.map(v => v.user_id))].filter(id => !thereSet.has(id));

    const message = `${venueName} is buzzing — ${count} people checked in right now.`;

    for (const recipientId of uniqueVisitors.slice(0, 30)) {
      triggerPushNotification({
        id: `venue_buzzing_${venueId}_${recipientId}_${Date.now()}`,
        receiver_id: recipientId,
        sender_id: recipientId,
        type: 'venue_buzzing',
        message,
      });
    }
  } catch (err) {
    console.error('[FOMO:VenueBuzzing] Error:', err);
  }
}

// ── 4. Weekend pregame nudge ──
// Trigger: scheduled for Fri/Sat 8-9pm
// "It's Friday night. What's the move? Set your status so friends can find you."

export async function sendWeekendPregameNudge(userId: string): Promise<void> {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const hour = now.getHours();

  // Only fire Fri/Sat between 8-9pm
  if (![5, 6].includes(day) || hour < 20 || hour >= 21) return;
  if (rateLimited('fomo_pregame', 24 * 60 * 60 * 1000)) return; // max once per day

  try {
    // Skip if user already has a status
    const { data: userStatus } = await supabase
      .from('night_statuses')
      .select('status')
      .eq('user_id', userId)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (userStatus) return;

    const dayName = day === 5 ? 'Friday' : 'Saturday';

    triggerPushNotification({
      id: `pregame_${userId}_${Date.now()}`,
      receiver_id: userId,
      sender_id: userId,
      type: 'weekend_pregame',
      message: `It's ${dayName} night. What's the move? Set your status so friends can find you.`,
    });
  } catch (err) {
    console.error('[FOMO:Pregame] Error:', err);
  }
}

// ── 5. Profile viewed ──
// Trigger: when someone views a user's profile
// "3 people checked out your profile tonight. Go live to show them what's up."

export async function notifyProfileViewed(viewedUserId: string): Promise<void> {
  try {
    const countKey = `profile_views_${viewedUserId}_${new Date().toDateString()}`;
    const current = parseInt(localStorage.getItem(countKey) || '0') + 1;
    localStorage.setItem(countKey, String(current));

    // Only notify at thresholds: 3, 5, 10
    if (![3, 5, 10].includes(current)) return;

    const notifKey = `fomo_profile_viewed_${viewedUserId}_${current}`;
    if (rateLimited(notifKey, 12 * 60 * 60 * 1000)) return;

    triggerPushNotification({
      id: `profile_viewed_${viewedUserId}_${Date.now()}`,
      receiver_id: viewedUserId,
      sender_id: viewedUserId,
      type: 'profile_viewed',
      message: `${current} people checked out your profile tonight. Go live to show them what's up.`,
    });
  } catch (err) {
    console.error('[FOMO:ProfileViewed] Error:', err);
  }
}

// ── 6. Group is forming ──
// Trigger: when a friend creates a plan, check if mutual friends also have plans in same area
// "Blake and Reese are both planning Hollywood tonight. Join the move?"

export async function checkGroupForming(
  userId: string,
  planningNeighborhood: string | null,
): Promise<void> {
  if (!planningNeighborhood) return;
  if (rateLimited(`fomo_group_forming_${userId}`, 4 * 60 * 60 * 1000)) return;

  try {
    const friendIds = await getFriendIds(userId);
    if (friendIds.length === 0) return;

    // Find friends planning in the same neighborhood
    const { data: planningFriends } = await supabase
      .from('night_statuses')
      .select('user_id')
      .in('user_id', friendIds)
      .eq('status', 'planning')
      .eq('planning_neighborhood', planningNeighborhood)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    if (!planningFriends || planningFriends.length < 2) return;

    // Get names of the planning friends
    const plannerIds = planningFriends.map(f => f.user_id).slice(0, 3);
    const { data: profiles } = await supabase.rpc('get_profiles_safe');
    const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.display_name]));

    const names = plannerIds.map(id => nameMap.get(id) || 'A friend');
    const nameText = names.length === 2
      ? `${names[0]} and ${names[1]} are`
      : `${names[0]}, ${names[1]}, and ${planningFriends.length - 2} more are`;

    // Notify other friends who don't have a status yet
    const plannerSet = new Set(planningFriends.map(f => f.user_id));
    const { data: allStatuses } = await supabase
      .from('night_statuses')
      .select('user_id')
      .in('user_id', friendIds)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    const hasStatusSet = new Set((allStatuses || []).map(s => s.user_id));
    const toNotify = friendIds.filter(id => !hasStatusSet.has(id) && !plannerSet.has(id));

    const message = `${nameText} both planning ${planningNeighborhood} tonight. Join the move?`;

    for (const recipientId of toNotify.slice(0, 20)) {
      triggerPushNotification({
        id: `group_forming_${recipientId}_${Date.now()}`,
        receiver_id: recipientId,
        sender_id: userId,
        type: 'group_forming',
        message,
      });
    }
  } catch (err) {
    console.error('[FOMO:GroupForming] Error:', err);
  }
}

// ── 7. Top venue tonight ──
// Trigger: periodic check (e.g. 10-11pm), when a venue is #1 on leaderboard
// "A ton of people are heading to Sound Nightclub — it's #1 on the leaderboard tonight. Go out?"

export async function checkTopVenueTonight(userId: string, city: string): Promise<void> {
  if (rateLimited(`fomo_top_venue_${userId}`, 6 * 60 * 60 * 1000)) return;

  try {
    // Skip if user is already out
    const { data: userStatus } = await supabase
      .from('night_statuses')
      .select('status')
      .eq('user_id', userId)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (userStatus?.status === 'out') return;

    // Find the top venue by current check-in count
    const { data: topVenues } = await supabase
      .from('night_statuses')
      .select('venue_id, venue_name')
      .eq('status', 'out')
      .not('venue_id', 'is', null)
      .not('expires_at', 'is', null)
      .gt('expires_at', new Date().toISOString());

    if (!topVenues || topVenues.length === 0) return;

    // Count by venue
    const counts = new Map<string, { name: string; count: number }>();
    for (const s of topVenues) {
      if (!s.venue_id) continue;
      const existing = counts.get(s.venue_id);
      if (existing) {
        existing.count++;
      } else {
        counts.set(s.venue_id, { name: s.venue_name || 'a venue', count: 1 });
      }
    }

    // Find the #1 venue
    let topVenue: { id: string; name: string; count: number } | null = null;
    for (const [id, data] of counts) {
      if (!topVenue || data.count > topVenue.count) {
        topVenue = { id, name: data.name, count: data.count };
      }
    }

    if (!topVenue || topVenue.count < 5) return; // needs at least 5 people

    triggerPushNotification({
      id: `top_venue_${userId}_${Date.now()}`,
      receiver_id: userId,
      sender_id: userId,
      type: 'top_venue_tonight',
      message: `A ton of people are heading to ${topVenue.name} — it's #1 on the leaderboard tonight. Go out?`,
    });
  } catch (err) {
    console.error('[FOMO:TopVenue] Error:', err);
  }
}
