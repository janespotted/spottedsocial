import type { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * Friend-card relationship controls (addendum v3 §1): Close Friend ↔ Friend,
 * remove with undo, hide my location from one person, mutual friends.
 * Ports of the web FriendIdCard handlers. Every writer here is followed by
 * invalidateFriendGraph() in the caller so the map, lists and cards agree.
 */

export const FRIEND_GRAPH_QUERY_KEYS = [
  ['friend-ids'],
  ['friends-out'],
  ['map-data'],
  ['friend-card'],
  ['profile-page'],
  ['friends'],
  ['mutual-friends-with'],
] as const;

export function invalidateFriendGraph(queryClient: QueryClient): void {
  for (const queryKey of FRIEND_GRAPH_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}

/** Close Friend on/off. Throws on failure so the caller can roll back. */
export async function setCloseFriend(userId: string, friendId: string, close: boolean): Promise<void> {
  if (close) {
    const { error } = await supabase
      .from('close_friends')
      .insert({ user_id: userId, close_friend_id: friendId });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('close_friends')
      .delete()
      .eq('user_id', userId)
      .eq('close_friend_id', friendId);
    if (error) throw error;
  }
}

/**
 * Remove a friend immediately (both friendship directions + the close-friend
 * row) and return a restore function for the Undo toast. The friendship
 * rows are captured first so undo re-inserts exactly what was there.
 */
export async function removeFriend(
  userId: string,
  friendId: string
): Promise<() => Promise<void>> {
  const pair = `and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`;
  const [{ data: rows }, { data: closeRow }] = await Promise.all([
    supabase.from('friendships').select('*').or(pair).eq('status', 'accepted'),
    supabase
      .from('close_friends')
      .select('close_friend_id')
      .eq('user_id', userId)
      .eq('close_friend_id', friendId)
      .maybeSingle(),
  ]);
  const wasClose = !!closeRow;

  const { error: closeErr } = await supabase
    .from('close_friends')
    .delete()
    .eq('user_id', userId)
    .eq('close_friend_id', friendId);
  if (closeErr) throw closeErr;
  const { error } = await supabase.from('friendships').delete().or(pair);
  if (error) throw error;

  return async () => {
    for (const row of rows ?? []) {
      const { id: _id, created_at: _created, ...insert } = row as Record<string, unknown> & {
        id: string;
        created_at: string | null;
      };
      const { error: restoreErr } = await supabase.from('friendships').insert(insert as never);
      if (restoreErr) throw restoreErr;
    }
    if (wasClose) await setCloseFriend(userId, friendId, true);
  };
}

/** Whether the viewer hides their location from this person (location_hidden). */
export async function fetchLocationHidden(userId: string, friendId: string): Promise<boolean> {
  const { data } = await supabase
    .from('location_hidden')
    .select('id')
    .eq('user_id', userId)
    .eq('hidden_from_id', friendId)
    .maybeSingle();
  return !!data;
}

/** Hide / unhide the viewer's location from one person. They are not notified. */
export async function setLocationHidden(userId: string, friendId: string, hidden: boolean): Promise<void> {
  if (hidden) {
    const { error } = await supabase
      .from('location_hidden')
      .insert({ user_id: userId, hidden_from_id: friendId });
    if (error && !error.message.includes('duplicate')) throw error;
  } else {
    const { error } = await supabase
      .from('location_hidden')
      .delete()
      .eq('user_id', userId)
      .eq('hidden_from_id', friendId);
    if (error) throw error;
  }
}

export interface MutualFriend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

/** Friends the viewer and this person share (server RPC, demo users excluded). */
export async function fetchMutualFriendsWith(otherUserId: string): Promise<MutualFriend[]> {
  const { data, error } = await supabase.rpc('get_mutual_friends_with', { p_other_id: otherUserId });
  if (error) return [];
  return (data ?? [])
    .filter((m) => !m.is_demo)
    .map((m) => ({ user_id: m.user_id, display_name: m.display_name, avatar_url: m.avatar_url }));
}

/** Viewer already has a pending request out to this person. */
export async function fetchFriendRequestPending(userId: string, otherUserId: string): Promise<boolean> {
  const { data } = await supabase
    .from('friendships')
    .select('id')
    .eq('user_id', userId)
    .eq('friend_id', otherUserId)
    .eq('status', 'pending')
    .maybeSingle();
  return !!data;
}

export async function cancelFriendRequest(userId: string, otherUserId: string): Promise<void> {
  await supabase
    .from('friendships')
    .delete()
    .eq('user_id', userId)
    .eq('friend_id', otherUserId)
    .eq('status', 'pending');
}
