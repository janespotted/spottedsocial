import { supabase } from './supabase';
import { isDemoMode } from './demo-mode';
import { fetchProfilesSafe } from './profiles';
import { isFromTonight } from './time-context';
import { nightStartAt } from './tonight';

/** Messages containing `[shared_post:<id>]` render as shared-post cards. */
export const SHARED_POST_REGEX = /^\[shared_post:([a-f0-9-]+)\]$/;

export interface DmMember {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  venue_name: string | null;
  venue_id: string | null;
}

export interface DmThreadPreview {
  id: string;
  is_group: boolean;
  name: string | null;
  group_avatar_url: string | null;
  members: DmMember[];
  venue_name: string | null;
  last_message: { text: string; created_at: string } | null;
  unread: boolean;
}

export interface DmMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  text: string;
  image_url: string | null;
  created_at: string;
}

export function threadTitle(thread: DmThreadPreview): string {
  if (thread.is_group) {
    if (thread.name) return thread.name;
    const names = thread.members.map((m) => m.display_name.split(' ')[0]);
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} & ${names.length - 2} others`;
  }
  return thread.members[0]?.display_name ?? 'Conversation';
}

/** Preview text for the thread list (shared posts render as a label). */
export function previewText(text: string): string {
  return SHARED_POST_REGEX.test(text) ? 'Shared a post' : text || '📷 Photo';
}

/**
 * Port of the web MessagesTab.fetchThreads: batched thread/member/message/
 * receipt queries, tonight-window last messages, unread via dm_read_receipts.
 */
export async function fetchDmThreads(userId: string): Promise<DmThreadPreview[]> {
  const { data: memberships } = await supabase
    .from('dm_thread_members')
    .select('thread_id')
    .eq('user_id', userId);
  const threadIds = (memberships ?? []).map((m) => m.thread_id);
  if (threadIds.length === 0) return [];

  const [threadsRes, membersRes, messagesRes, receiptsRes, profiles] = await Promise.all([
    supabase.from('dm_threads').select('id, is_group, name, group_avatar_url').in('id', threadIds),
    supabase
      .from('dm_thread_members')
      .select('thread_id, user_id')
      .in('thread_id', threadIds)
      .neq('user_id', userId),
    // Tonight's messages only — the same boundary the thread applies, moved
    // into the query so a late cron can't surface last night's previews
    supabase
      .from('dm_messages')
      .select('thread_id, text, created_at, sender_id')
      .in('thread_id', threadIds)
      .gte('created_at', nightStartAt().toISOString())
      .order('created_at', { ascending: false }),
    supabase
      .from('dm_read_receipts')
      .select('thread_id, last_read_at')
      .eq('user_id', userId)
      .in('thread_id', threadIds),
    fetchProfilesSafe(),
  ]);

  const threadInfo = new Map((threadsRes.data ?? []).map((t) => [t.id, t]));
  const allMembers = membersRes.data ?? [];
  const readAt = new Map((receiptsRes.data ?? []).map((r) => [r.thread_id, r.last_read_at]));
  const otherIds = [...new Set(allMembers.map((m) => m.user_id))];

  // fetchProfilesSafe filters demo in release; fall back for any not covered
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const missingIds = otherIds.filter((id) => !profileMap.has(id));
  if (missingIds.length > 0 && isDemoMode()) {
    const { data: fallback } = await supabase
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', missingIds);
    for (const p of fallback ?? []) {
      profileMap.set(p.id, { ...p, avatar_url: p.avatar_url ?? null } as never);
    }
  }

  // Other members' live venues (1:1 subtitle)
  const { data: statuses } = otherIds.length
    ? await supabase
        .from('night_statuses')
        .select('user_id, venue_name')
        .in('user_id', otherIds)
        .not('expires_at', 'is', null)
        .gt('expires_at', new Date().toISOString())
    : { data: [] };
  const venueByUser = new Map((statuses ?? []).map((s) => [s.user_id, s.venue_name]));

  // Latest tonight-window message per thread
  const latestByThread = new Map<string, { text: string; created_at: string; sender_id: string }>();
  for (const msg of messagesRes.data ?? []) {
    if (!msg.created_at || !isFromTonight(msg.created_at)) continue;
    if (!latestByThread.has(msg.thread_id)) {
      latestByThread.set(msg.thread_id, msg as never);
    }
  }

  const previews: DmThreadPreview[] = [];
  for (const threadId of threadIds) {
    const info = threadInfo.get(threadId);
    const members: DmMember[] = allMembers
      .filter((m) => m.thread_id === threadId)
      .map((m): DmMember | null => {
        const p = profileMap.get(m.user_id);
        if (!p) return null;
        return {
          user_id: m.user_id,
          display_name: p.display_name,
          username: p.username ?? '',
          avatar_url: p.avatar_url,
          venue_name: venueByUser.get(m.user_id) ?? null,
          venue_id: null,
        };
      })
      .filter((m): m is DmMember => m !== null);
    if (members.length === 0) continue;

    const last = latestByThread.get(threadId) ?? null;
    const myRead = readAt.get(threadId);
    const unread =
      !!last && last.sender_id !== userId && (!myRead || new Date(last.created_at) > new Date(myRead));

    previews.push({
      id: threadId,
      is_group: info?.is_group ?? false,
      name: info?.name ?? null,
      group_avatar_url: info?.group_avatar_url ?? null,
      members,
      venue_name: members.length === 1 ? members[0].venue_name : null,
      last_message: last ? { text: last.text, created_at: last.created_at } : null,
      unread,
    });
  }

  return previews.sort((a, b) =>
    (b.last_message?.created_at ?? '').localeCompare(a.last_message?.created_at ?? '')
  );
}

/** Find-or-create a 1:1 thread (server-side RPC handles dedup). */
export async function createDmThread(friendId: string): Promise<string> {
  const { data, error } = await (
    supabase.rpc as (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }>
  )('create_dm_thread', { friend_id: friendId });
  if (error || !data) throw error ?? new Error('Thread creation returned empty result');
  return data as string;
}

export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  await supabase
    .from('dm_read_receipts')
    .upsert(
      { thread_id: threadId, user_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'thread_id,user_id' }
    );
}

/**
 * In-app notification rows + APNs pushes for DM recipients. Fire-and-forget
 * (same contract as lib/notifications.ts helpers).
 */
export async function notifyDmRecipients(
  senderId: string,
  senderName: string,
  recipientIds: string[],
  text: string
): Promise<void> {
  const preview = text.length > 100 ? `${text.slice(0, 100)}...` : text;
  const message = `${senderName}: ${previewText(preview)}`;
  for (const receiverId of recipientIds) {
    try {
      const { data } = await supabase.rpc('create_notification', {
        p_receiver_id: receiverId,
        p_type: 'dm',
        p_message: message,
      });
      const notif = Array.isArray(data) ? data[0] : data;
      if (!notif?.id) continue;
      await supabase.functions.invoke('send-push', {
        body: {
          notification_id: notif.id,
          receiver_id: receiverId,
          sender_id: senderId,
          type: 'dm',
          message,
        },
      });
    } catch {
      /* never let notification failures surface */
    }
  }
}
