import { supabase } from './supabase';
import { fetchProfilesSafe } from './profiles';
import { MAX_GROUP_FRIENDS } from './dm';

export async function fetchGroupMembers(threadId: string) {
  const [thread, members, profiles] = await Promise.all([
    supabase.from('dm_threads').select('id, name, created_by').eq('id', threadId).eq('is_group', true).maybeSingle(),
    supabase.from('dm_thread_members').select('user_id').eq('thread_id', threadId),
    fetchProfilesSafe(),
  ]);
  if (thread.error || members.error) throw thread.error ?? members.error;
  if (!thread.data) return null;
  const byId = new Map(profiles.map(p => [p.id, p]));
  // Group members need not be mutual friends. Only basic identity is exposed;
  // location/audience data is never inferred from membership.
  const missing = (members.data ?? []).map(m => m.user_id).filter(id => !byId.has(id));
  const fallback = missing.length ? await supabase.from('profiles')
    .select('id, display_name, username, avatar_url').in('id', missing) : { data: [], error: null };
  if (fallback.error) throw fallback.error;
  const basic = new Map((fallback.data ?? []).map(p => [p.id, p]));
  return {
    ...thread.data,
    members: (members.data ?? []).map(m => {
      const p = byId.get(m.user_id) ?? basic.get(m.user_id);
      return { id: m.user_id, display_name: p?.display_name ?? 'Group member', avatar_url: p?.avatar_url ?? null };
    }),
  };
}

export async function addGroupMembers(threadId: string, ids: string[]) {
  const members = [...new Set(ids)];
  if (!threadId || !members.length || members.length > MAX_GROUP_FRIENDS || members.some(id => !id)) {
    throw new Error('Choose friends to add.');
  }
  const { error } = await supabase.rpc('add_group_members', { p_thread: threadId, p_members: members });
  if (error) throw error;
}

export async function removeGroupMember(threadId: string, memberId: string) {
  if (!threadId || !memberId) throw new Error('Choose a group member.');
  const { error } = await supabase.rpc('remove_group_member', { p_thread: threadId, p_member: memberId });
  if (error) throw error;
}
