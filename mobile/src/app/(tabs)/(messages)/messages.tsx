import { RefreshControl, Text, View } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { Card, Skeleton } from 'heroui-native';
import { useQuery } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { Avatar } from '@/components/avatar';
import { useSession } from '@/hooks/use-session';

interface ThreadPreview {
  id: string;
  title: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  isGroup: boolean;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  const mins = Math.floor((Date.now() - then.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

async function fetchThreads(userId: string): Promise<ThreadPreview[]> {
  const { data: myMemberships } = await supabase
    .from('dm_thread_members')
    .select('thread_id')
    .eq('user_id', userId);
  const threadIds = (myMemberships ?? []).map((m) => m.thread_id);
  if (threadIds.length === 0) return [];

  const [{ data: threads }, { data: members }, { data: messages }, profiles] =
    await Promise.all([
      supabase.from('dm_threads').select('*').in('id', threadIds),
      supabase.from('dm_thread_members').select('thread_id, user_id').in('thread_id', threadIds),
      supabase
        .from('dm_messages')
        .select('thread_id, text, created_at')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false })
        .limit(200),
      fetchProfilesSafe(),
    ]);

  const profileMap = buildProfileMap(profiles);

  const lastByThread = new Map<string, { text: string; created_at: string | null }>();
  for (const m of messages ?? []) {
    if (!lastByThread.has(m.thread_id)) {
      lastByThread.set(m.thread_id, { text: m.text, created_at: m.created_at });
    }
  }

  const previews = (threads ?? []).map((t) => {
    const others = (members ?? [])
      .filter((m) => m.thread_id === t.id && m.user_id !== userId)
      .map((m) => profileMap.get(m.user_id))
      .filter(Boolean);
    const last = lastByThread.get(t.id);
    return {
      id: t.id,
      title: t.is_group
        ? t.name ?? others.map((p) => p!.display_name).join(', ')
        : others[0]?.display_name ?? 'Conversation',
      avatarUrl: t.is_group ? t.group_avatar_url : others[0]?.avatar_url ?? null,
      lastMessage: last?.text ?? null,
      lastMessageAt: last?.created_at ?? null,
      isGroup: t.is_group ?? false,
    };
  });

  return previews.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

function ThreadRow({ thread }: { thread: ThreadPreview }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <Avatar name={thread.title} url={thread.avatarUrl} size="md" />
      <View className="flex-1 gap-0.5">
        <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
          {thread.title}
        </Text>
        <Text className="text-muted text-sm" numberOfLines={1}>
          {thread.lastMessage ?? 'Say hi 👋'}
        </Text>
      </View>
      <Text className="text-muted-dark text-sm">{formatWhen(thread.lastMessageAt)}</Text>
    </View>
  );
}

function RowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <Skeleton className="h-11 w-11 rounded-full" />
      <View className="flex-1 gap-1.5">
        <Skeleton className="h-3.5 w-36 rounded-md" />
        <Skeleton className="h-3 w-48 rounded-md" />
      </View>
    </View>
  );
}

export default function MessagesScreen() {
  const { session } = useSession();
  const contentContainerStyle = useResolveClassNames('p-4');
  const { data: threads, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['dm-threads', session?.user.id],
    enabled: !!session,
    staleTime: 15_000,
    queryFn: () => fetchThreads(session!.user.id),
  });

  return (
    <LegendList
      data={threads ?? []}
      keyExtractor={(t) => t.id}
      recycleItems
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={contentContainerStyle}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColorClassName="accent-accent"
        />
      }
      ListEmptyComponent={
        isLoading ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : (
          <Card className="bg-surface border-0 p-4">
            <Card.Body>
              <Text className="text-muted text-base">
                No conversations yet — DM a friend from their profile.
              </Text>
            </Card.Body>
          </Card>
        )
      }
      renderItem={({ item }) => <ThreadRow thread={item} />}
    />
  );
}
