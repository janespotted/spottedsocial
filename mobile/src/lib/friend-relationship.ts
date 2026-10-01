import type { QueryClient } from '@tanstack/react-query';
import { invalidatePrivateViews } from './private-views';
import { supabase } from './supabase';

/**
 * Friend-card relationship controls (addendum v3 §1): Close Friend ↔ Friend,
 * remove with undo, hide my location from one person, mutual friends.
 * Ports of the web FriendIdCard handlers. Every writer here is followed by
 * invalidateFriendGraph() in the caller so the map, lists and cards agree.
 */

export { PRIVATE_VIEW_KEYS } from './private-views';
export function invalidateFriendGraph(queryClient: QueryClient): void {
  invalidatePrivateViews(queryClient);
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
 * server retains short-lived, caller-bound consent so Undo cannot forge acceptance.
 */
export async function removeFriend(
  userId: string,
  friendId: string
): Promise<() => Promise<void>> {
  if (!userId) throw new Error('Authentication required');
  const { data: token, error } = await supabase.rpc('remove_friendship', { p_other: friendId });
  if (error) throw error;
  return async () => {
    if (!token) return;
    const { error: restoreError } = await supabase.rpc('restore_friendship', { p_token: token });
    if (restoreError) throw restoreError;
  };
}

/** Whether the viewer hides their location from this person (location_hidden). */
export async function fetchLocationHidden(userId: string, friendId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('location_hidden')
    .select('id')
    .eq('user_id', userId)
    .eq('hidden_from_id', friendId)
    .maybeSingle();
  if (error) throw error;
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
  if (error) throw error;
  return (data ?? [])
    .filter((m) => !m.is_demo)
    .map((m) => ({ user_id: m.user_id, display_name: m.display_name, avatar_url: m.avatar_url }));
}

/** Viewer already has a pending request out to this person. */
export async function fetchFriendRequestPending(userId: string, otherUserId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id')
    .eq('user_id', userId)
    .eq('friend_id', otherUserId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function cancelFriendRequest(userId: string, otherUserId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_id', userId)
    .eq('friend_id', otherUserId)
    .eq('status', 'pending');
  if (error) throw error;
}
