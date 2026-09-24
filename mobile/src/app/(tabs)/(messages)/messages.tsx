import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LegendList } from '@legendapp/list/react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { fetchDmThreads, previewText, threadTitle, type DmThreadPreview } from '@/lib/dm';
import { useSession } from '@/hooks/use-session';
import { useNoKeyboardOnFocus } from '@/hooks/use-dismiss-keyboard-on-leave';
import { useNotifications } from '@/hooks/use-notifications';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { Avatar } from '@/components/avatar';
import { HeaderActions } from '@/components/header-actions';
import { EmptyState, ErrorState } from '@/components/empty-state';
import { addFriendsActions } from '@/lib/add-friends';
import { PlansFeed } from '@/components/plans-feed';
import { NEON, PURPLE } from '@/lib/theme';

type TabType = 'plans' | 'messages';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function GroupAvatar({ thread }: { thread: DmThreadPreview }) {
  if (thread.group_avatar_url) {
    return <Avatar name={threadTitle(thread)} url={thread.group_avatar_url} size="md" />;
  }
  return (
    <View className="w-11 h-11 rounded-full bg-[#1a0f2e] border-2 border-white/20 items-center justify-center">
      <SymbolView name="person.2.fill" size={18} tintColor={PURPLE} />
    </View>
  );
}

function ThreadRow({ thread, onPress }: { thread: DmThreadPreview; onPress: () => void }) {
  const title = threadTitle(thread);
  const subtitle = thread.last_message
    ? previewText(thread.last_message.text)
    : thread.venue_name
      ? `@ ${thread.venue_name}`
      : 'Say hi 👋';
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3 active:opacity-70">
      {thread.is_group ? (
        <GroupAvatar thread={thread} />
      ) : (
        <Avatar name={title} url={thread.members[0]?.avatar_url ?? null} size="md" />
      )}
      <View className="flex-1 min-w-0 gap-0.5">
        <Text
          className={`text-base ${thread.unread ? 'text-white font-sans-semibold' : 'text-white font-sans-medium'}`}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View className="flex-row items-center gap-1.5">
          {thread.venue_name && thread.last_message ? (
            <Text className="text-[#d4ff00] text-xs font-sans-medium" numberOfLines={1}>
              @ {thread.venue_name}
            </Text>
          ) : null}
          <Text
            className={`text-sm shrink font-sans ${thread.unread ? 'text-white/90' : 'text-white/55'}`}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      <View className="items-end gap-1.5">
        <Text className="text-white/45 text-xs font-sans">
          {formatWhen(thread.last_message?.created_at ?? null)}
        </Text>
        {thread.unread ? (
          <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NEON }} />
        ) : null}
      </View>
    </Pressable>
  );
}

function RowSkeleton() {
  return (
    <View className="flex-row items-center gap-3 py-3">
      <View className="h-11 w-11 rounded-full bg-white/10" />
      <View className="flex-1 gap-1.5">
        <View className="h-3.5 w-36 rounded-md bg-white/10" />
        <View className="h-3 w-48 rounded-md bg-white/[0.06]" />
      </View>
    </View>
  );
}

export default function MessagesScreen() {
  useNoKeyboardOnFocus(); // back from a thread must never leave the keyboard up
  const { session } = useSession();
  const { unreadCount } = useNotifications();
  const queryClient = useQueryClient();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('plans');
  useEffect(() => { if (tab === 'plans' || tab === 'dms') setActiveTab(tab === 'dms' ? 'messages' : 'plans'); }, [tab]);
  // pb clears the native tab bar + home indicator so the last row is reachable
  const contentContainerStyle = useResolveClassNames('px-4 pb-28');

  const { data: city } = useQuery({
    queryKey: ['home-city', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('city')
        .eq('id', session!.user.id)
        .maybeSingle<{ city: string | null }>();
      return data?.city ?? 'nyc';
    },
  });

  const {
    data: threads,
    isLoading,
    isError: threadsError,
    isRefetching: threadsRefetching,
    refetch,
  } = useQuery({
    queryKey: ['dm-threads', session?.user.id],
    enabled: !!session,
    staleTime: 15_000,
    queryFn: () => fetchDmThreads(session!.user.id),
  });
  const { data: friendIds } = useFriendIds(session?.user.id);
  const hasFriends = (friendIds?.length ?? 0) > 0;

  // DM changes refresh the list.
  useEffect(() => {
    if (!session) return;
    return createResilientChannel({
      name: 'dm-list-realtime',
      onReconnect: () => {
        queryClient.invalidateQueries({ queryKey: ['dm-threads'] });
      },
      configure: (ch) => {
        ch.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dm_messages' },
          () => queryClient.invalidateQueries({ queryKey: ['dm-threads'] })
        );
        return ch;
      },
    });
  }, [session, queryClient]);

  // Pull-to-refresh owns this flag, not the query's isRefetching: realtime
  // invalidations (a DM sent from the thread screen) refetch in the
  // background, and isRefetching would show a spinner nobody pulled for.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullToRefresh = async (fn: () => Promise<unknown>) => {
    setIsRefreshing(true);
    try {
      await fn();
    } finally {
      setIsRefreshing(false);
    }
  };

  const openThread = (thread: DmThreadPreview) => {
    router.push({
      pathname: '/thread',
      params: {
        threadId: thread.id,
        title: threadTitle(thread),
        avatarUrl: thread.is_group
          ? (thread.group_avatar_url ?? '')
          : (thread.members[0]?.avatar_url ?? ''),
      },
    });
  };

  return (
    <View className="flex-1">
      {/* Header — static, web PageHeader parity */}
      <View className="pt-safe-offset-3 z-10" style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}>
        <View className="flex-row items-center justify-between px-4 h-10">
          <View className="flex-row items-center gap-2 flex-1 min-w-0">
            <Text
              className="text-white font-sans-light"
              numberOfLines={1}
              style={{ fontSize: 20, letterSpacing: 20 * 0.28 }}
            >
              Spotted
            </Text>
            {city ? (
              <View className="px-2.5 py-1 rounded-full bg-white/10">
                <Text className="text-white/70 text-xs font-sans-medium uppercase">{city}</Text>
              </View>
            ) : null}
          </View>
          <HeaderActions unreadCount={unreadCount} />
        </View>

        {/* Plans and direct/group messages. */}
        <View className="flex-row items-center px-4 pt-2 pb-3">
          {(
            [
              ['plans', 'Plans'],
              ['messages', 'DMs'],
            ] as [TabType, string][]
          ).map(([tab, label]) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} className="mr-6">
              <Text
                className="font-sans-semibold text-2xl"
                style={{ color: activeTab === tab ? '#ffffff' : 'rgba(255,255,255,0.4)' }}
              >
                {label}
              </Text>
              {activeTab === tab ? (
                <View
                  className="rounded-full mt-0.5"
                  style={{ height: 2.5, backgroundColor: NEON }}
                />
              ) : null}
            </Pressable>
          ))}
          <View className="flex-1" />
          {activeTab === 'messages' ? (
            // Compose icon, same flow as the empty-state "New chat" button
            <Pressable
              onPress={() => router.push('/new-chat')}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="New chat"
              className="w-9 h-9 rounded-full items-center justify-center active:opacity-90"
              style={{ backgroundColor: NEON }}
            >
              <SymbolView name="square.and.pencil" size={17} tintColor="#1a0f2e" weight="semibold" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {activeTab === 'plans' ? (
        // Plans moved here from Home. This header is static, so the feed's
        // collapse callback has nothing to drive.
        <PlansFeed city={city ?? null} onScroll={() => {}} />
      ) : (
        <LegendList
          data={threads ?? []}
          keyExtractor={(t) => t.id}
          recycleItems
          contentContainerStyle={contentContainerStyle}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => pullToRefresh(refetch)}
              tintColorClassName="accent-[#d4ff00]"
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <View>
                <RowSkeleton />
                <RowSkeleton />
                <RowSkeleton />
              </View>
            ) : threadsError ? (
              <ErrorState title="Couldn't load your messages" onRetry={() => refetch()} retrying={threadsRefetching} />
            ) : !hasFriends ? (
              // No friends means nobody to chat with: grow the graph first
              <EmptyState
                icon="person.2"
                title="Add friends to start chatting"
                body="Messages on Spotted are between friends. Find people you know and the chat opens up."
                actions={addFriendsActions()}
              />
            ) : (
              <EmptyState
                icon="bubble.left"
                title="No messages yet"
                body="Start a conversation with a friend, or meet up with someone who's out."
                actions={[
                  { label: 'New chat', icon: 'square.and.pencil', primary: true, onPress: () => router.push('/new-chat') },
                ]}
              />
            )
          }
          renderItem={({ item }) => <ThreadRow thread={item} onPress={() => openThread(item)} />}
        />
      )}
    </View>
  );
}
