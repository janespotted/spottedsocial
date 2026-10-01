import { supabase } from './supabase';

export interface SuggestedFriend {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  mutual_count: number;
}

/** Friends-of-friends ranked by mutual count (get_people_you_may_know RPC). */
export async function fetchPeopleYouMayKnow(userId: string): Promise<SuggestedFriend[]> {
  const { data, error } = await (
    supabase.rpc as (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }>
  )('get_people_you_may_know', { p_user_id: userId, p_limit: 10 });
  if (error) return [];
  return ((data ?? []) as Array<{ user_id: string; display_name: string; username?: string; avatar_url: string | null; mutual_count?: number }>).map((r) => ({
    id: r.user_id,
    display_name: r.display_name,
    username: r.username ?? '',
    avatar_url: r.avatar_url ?? null,
    mutual_count: Number(r.mutual_count ?? 0),
  }));
}

/**
 * Send a friend request: pending friendship row + friend_request
 * notification/push (web Friends.sendFriendRequest parity). Returns false
 * when the insert fails (e.g. duplicate).
 */
export async function sendFriendRequest(senderId: string, receiverId: string): Promise<boolean> {
  const { error } = await supabase
    .from('friendships')
    .insert({ user_id: senderId, friend_id: receiverId, status: 'pending' });
  if (error) return false;

  // The database creates the notification in the relationship transaction.
  return true;
}
