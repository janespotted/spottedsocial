import { supabase } from './supabase';
import { buildProfileMap, fetchProfilesSafe, type SafeProfile } from './profiles';
import { isDemoMode } from './demo-mode';
import { nightResetAfterDate } from './tonight';

export interface Plan {
  id: string;
  user_id: string;
  venue_id: string | null;
  venue_name: string;
  plan_date: string;
  plan_time: string;
  plan_type: string | null;
  description: string | null;
  visibility: string;
  score: number;
  comments_count: number;
  created_at: string;
  user?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_demo: boolean;
  };
}

export interface PlanPerson {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface PlanComment {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
}

export interface FriendRsvp extends PlanPerson {
  rsvp_type: 'interested' | 'going';
}

export interface EventWithFriends {
  id: string;
  venue_id: string | null;
  venue_name: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string | null;
  cover_image_url: string | null;
  ticket_url: string | null;
  friendsInterested: FriendRsvp[];
  isDown: boolean;
}

export const PLAN_TYPES: { value: string; label: string; emoji: string }[] = [
  { value: 'event', label: 'Event', emoji: '🎉' },
  { value: 'party', label: 'Party', emoji: '🥳' },
  { value: 'dinner', label: 'Dinner', emoji: '🍽️' },
  { value: 'pregame', label: 'Pregame', emoji: '🍻' },
  { value: 'afterparty', label: 'Afterparty', emoji: '🌙' },
  { value: 'kickback', label: 'Kickback', emoji: '😎' },
];

/** "21:30" → "9:30PM" */
export function formatTimeTo12Hour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}${minutes > 0 ? ':' + minutes.toString().padStart(2, '0') : ''}${period}`;
}

/** Tonight / Tomorrow / "In N days" / "Fri, Jan 3" — port of getSmartDateLabel. */
export function getSmartDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAway = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (daysAway === 0) return 'Tonight';
  if (daysAway === 1) return 'Tomorrow';
  if (daysAway > 1 && daysAway <= 7) return `In ${daysAway} days`;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Local YYYY-MM-DD (toISOString would shift across UTC midnight). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Plans expire at 5am the day AFTER the plan date (nightlife rollover) in
 * the PROFILE CITY's zone, like every other expiry (lib/tonight.ts). It
 * used to use a local-time constructor, so a New York user creating a plan
 * while in Los Angeles got one that outlived their own reset by three
 * hours (addendum v3 §2).
 */
export function getPlanExpiry(planDate: string, city?: string | null): string {
  return nightResetAfterDate(planDate, city).toISOString();
}

/** Unexpired plans, highest score first, with author profiles attached. */
export async function fetchPlans(): Promise<Plan[]> {
  let query = supabase
    .from('plans')
    .select('*')
    .gte('expires_at', new Date().toISOString())
    .order('score', { ascending: false })
    .order('created_at', { ascending: false });
  if (!isDemoMode()) query = query.eq('is_demo', false);

  const [{ data: plans, error }, profiles] = await Promise.all([query, fetchProfilesSafe()]);
  if (error) throw error;

  const profileMap = buildProfileMap(profiles);
  return (plans ?? [])
    .filter((p) => profileMap.has(p.user_id))
    .map((p) => {
      const author = profileMap.get(p.user_id)!;
      return {
        ...p,
        score: p.score ?? 0,
        comments_count: p.comments_count ?? 0,
        created_at: p.created_at ?? new Date().toISOString(),
        user: {
          id: author.id,
          display_name: author.display_name,
          avatar_url: author.avatar_url,
          is_demo: author.is_demo,
        },
      };
    });
}

/** The caller's up/down votes, keyed by plan id. */
export async function fetchMyVotes(userId: string): Promise<Record<string, 'up' | 'down'>> {
  const { data } = await supabase
    .from('plan_votes')
    .select('plan_id, vote_type')
    .eq('user_id', userId);
  const votes: Record<string, 'up' | 'down'> = {};
  for (const v of data ?? []) votes[v.plan_id] = v.vote_type as 'up' | 'down';
  return votes;
}

/** Toggle/change a vote. Same-vote removes, other-vote switches, none inserts. */
export async function votePlan(
  planId: string,
  userId: string,
  voteType: 'up' | 'down',
  currentVote: 'up' | 'down' | null
): Promise<void> {
  if (currentVote === voteType) {
    await supabase.from('plan_votes').delete().eq('plan_id', planId).eq('user_id', userId);
  } else if (currentVote) {
    await supabase
      .from('plan_votes')
      .update({ vote_type: voteType })
      .eq('plan_id', planId)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('plan_votes')
      .insert({ plan_id: planId, user_id: userId, vote_type: voteType });
  }
}

/** "I'm down" reactions on a plan, with profiles. */
export async function fetchPlanDowns(planId: string): Promise<PlanPerson[]> {
  const { data } = await supabase.from('plan_downs').select('user_id').eq('plan_id', planId);
  if (!data?.length) return [];
  const profiles = await fetchProfilesSafe();
  const profileMap = buildProfileMap(profiles);
  return data
    .filter((d) => profileMap.has(d.user_id))
    .map((d) => ({
      user_id: d.user_id,
      display_name: profileMap.get(d.user_id)!.display_name,
      avatar_url: profileMap.get(d.user_id)!.avatar_url,
    }));
}

/** Friends the creator tagged as going with them. */
export async function fetchPlanParticipants(planId: string): Promise<PlanPerson[]> {
  const { data } = await supabase.from('plan_participants').select('user_id').eq('plan_id', planId);
  if (!data?.length) return [];
  const profiles = await fetchProfilesSafe();
  const profileMap = buildProfileMap(profiles);
  return data
    .filter((p) => profileMap.has(p.user_id))
    .map((p) => ({
      user_id: p.user_id,
      display_name: profileMap.get(p.user_id)!.display_name,
      avatar_url: profileMap.get(p.user_id)!.avatar_url,
    }));
}

export async function fetchPlanComments(planId: string): Promise<PlanComment[]> {
  const { data } = await supabase
    .from('plan_comments')
    .select('id, user_id, text, created_at')
    .eq('plan_id', planId)
    .order('created_at', { ascending: true });
  if (!data?.length) return [];
  const profiles = await fetchProfilesSafe();
  const profileMap = buildProfileMap(profiles);
  return data.map((c) => ({
    ...c,
    created_at: c.created_at ?? new Date().toISOString(),
    display_name: profileMap.get(c.user_id)?.display_name ?? 'Unknown',
    avatar_url: profileMap.get(c.user_id)?.avatar_url ?? null,
  }));
}

export async function postPlanComment(planId: string, userId: string, text: string): Promise<void> {
  const { error } = await supabase
    .from('plan_comments')
    .insert({ plan_id: planId, user_id: userId, text });
  if (error) throw error;
}

export async function deletePlan(planId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('plans').delete().eq('id', planId).eq('user_id', userId);
  if (error) throw error;
}

/**
 * Upcoming events in the user's city that at least one friend has RSVP'd to,
 * sorted by friend count. Port of the web PlansFeed.fetchEvents.
 */
export async function fetchEventsWithFriends(
  city: string,
  userId: string,
  friendIds: string[]
): Promise<EventWithFriends[]> {
  if (friendIds.length === 0) return [];

  const today = toLocalDateString(new Date());
  let eventsQuery = supabase
    .from('events')
    .select('*')
    .gte('event_date', today)
    .gt('expires_at', new Date().toISOString())
    .eq('city', city)
    .order('event_date', { ascending: true });
  if (!isDemoMode()) eventsQuery = eventsQuery.eq('is_demo', false);

  const { data: events } = await eventsQuery;
  if (!events?.length) return [];

  const [{ data: rsvps }, profiles] = await Promise.all([
    supabase
      .from('event_rsvps')
      .select('event_id, user_id, rsvp_type')
      .in('event_id', events.map((e) => e.id)),
    fetchProfilesSafe(),
  ]);

  const friendSet = new Set(friendIds);
  const friendRsvps = (rsvps ?? []).filter((r) => friendSet.has(r.user_id));
  if (friendRsvps.length === 0) return [];

  const profileMap = buildProfileMap(profiles);
  const result: EventWithFriends[] = [];
  for (const event of events) {
    const friendsInterested = friendRsvps
      .filter((r) => r.event_id === event.id && profileMap.has(r.user_id))
      .map((r) => {
        const profile = profileMap.get(r.user_id) as SafeProfile;
        return {
          user_id: r.user_id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          rsvp_type: r.rsvp_type as 'interested' | 'going',
        };
      });
    if (friendsInterested.length > 0) {
      const isDown = (rsvps ?? []).some((r) => r.event_id === event.id && r.user_id === userId);
      result.push({ ...event, friendsInterested, isDown });
    }
  }

  result.sort((a, b) => b.friendsInterested.length - a.friendsInterested.length);
  return result;
}

export async function toggleEventRsvp(
  eventId: string,
  userId: string,
  isDown: boolean
): Promise<void> {
  if (isDown) {
    const { error } = await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('event_rsvps')
      .insert({ event_id: eventId, user_id: userId, rsvp_type: 'interested' });
    if (error) throw error;
  }
}
