import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { Image } from '@/components/styled';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LegendList } from '@legendapp/list/react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { fetchDmThreads, previewText, threadTitle, type DmThreadPreview } from '@/lib/dm';
import { fetchYapDirectory, type YapQuote } from '@/lib/yap';
import { useSession } from '@/hooks/use-session';
import { useNotifications } from '@/hooks/use-notifications';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { Avatar } from '@/components/avatar';
import { HeaderActions } from '@/components/header-actions';
import { EmptyState, ErrorState } from '@/components/empty-state';
import { addFriendsActions } from '@/lib/add-friends';
import { NEON, PURPLE } from '@/lib/theme';

type TabType = 'yap' | 'messages';

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

const relativeTime = (dateStr: string) => {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
};

/** Yap directory row — text, venue chip, pins, time, score (web parity) */
function YapRow({ quote, index, onPress }: { quote: YapQuote; index: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-4 py-3 active:opacity-70 ${index > 0 ? 'border-t border-white/[0.06]' : ''}`}
    >
      <Text className="text-white text-[15px] font-sans leading-snug mb-1.5">{quote.text}</Text>
      <View className="flex-row items-center gap-1.5">
        <View className="flex-row items-center gap-1 bg-white/[0.06] rounded-full px-2 py-0.5 shrink">
          <SymbolView name="mappin" size={11} tintColor="rgba(255,255,255,0.4)" />
          <Text className="text-white/50 text-xs font-sans" numberOfLines={1}>
            {quote.venue_name}
            {quote.venue_neighborhood ? ` · ${quote.venue_neighborhood}` : ''}
          </Text>
        </View>
        {quote.pinned_count > 0 ? (
          <View className="flex-row items-center gap-0.5">
            <SymbolView name="pin.fill" size={10} tintColor={NEON} />
            <Text className="text-white/45 text-[11px] font-sans">{quote.pinned_count}</Text>
          </View>
        ) : null}
        <Text className="text-white/40 text-xs font-sans ml-auto">
          {relativeTime(quote.created_at)}
        </Text>
      </View>
      {quote.score > 0 ? (
        <View className="flex-row items-center gap-1 mt-1">
          <SymbolView name="arrowtriangle.up.fill" size={10} tintColor="rgba(255,255,255,0.3)" />
          <Text className="text-white/55 text-xs font-sans-medium">{quote.score}</Text>
        </View>
      ) : null}
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
  const { session } = useSession();
  const { unreadCount } = useNotifications();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('yap');
  const [yapSort, setYapSort] = useState<'hot' | 'new'>('hot');
  // pb clears the native tab bar + home indicator so the last row is reachable
  const contentContainerStyle = useResolveClassNames('px-4 pb-28');
  const yapContentStyle = useResolveClassNames('pb-28');

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

  // Yap directory + own venue for the "You're At" row
  const {
    data: yaps,
    isLoading: yapsLoading,
    refetch: refetchYaps,
  } = useQuery({
    queryKey: ['yap-directory', city],
    enabled: !!session && !!city && activeTab === 'yap',
    staleTime: 15_000,
    queryFn: () => fetchYapDirectory(city!),
  });
  const { data: ownNight } = useOwnNightStatus();
  const myVenue = ownNight?.status ?? null;

  // Any new DM/yap anywhere refreshes the lists
  useEffect(() => {
    if (!session) return;
    return createResilientChannel({
      name: 'dm-list-realtime',
      onReconnect: () => {
        queryClient.invalidateQueries({ queryKey: ['dm-threads'] });
        queryClient.invalidateQueries({ queryKey: ['yap-directory'] });
      },
      configure: (ch) =>
        ch
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'dm_messages' },
            () => queryClient.invalidateQueries({ queryKey: ['dm-threads'] })
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'yap_messages' },
            () => queryClient.invalidateQueries({ queryKey: ['yap-directory'] })
          ),
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

  const sortedYaps = [...(yaps ?? [])].sort((a, b) =>
    yapSort === 'hot'
      ? b.score - a.score
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const openYapThread = (venueName: string) => {
    router.push({ pathname: '/yap-thread', params: { venueName } });
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

        {/* Yap | Messages tabs (web parity) + new chat */}
        <View className="flex-row items-center px-4 pt-2 pb-3">
          {(
            [
              ['yap', 'Yap'],
              ['messages', 'Messages'],
            ] as const
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

      {activeTab === 'yap' ? (
        <LegendList
          data={sortedYaps}
          keyExtractor={(q) => q.id}
          recycleItems
          contentContainerStyle={yapContentStyle}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => pullToRefresh(refetchYaps)}
              tintColorClassName="accent-[#d4ff00]"
            />
          }
          ListHeaderComponent={
            <View>
              {/* You're At — slim tappable row */}
              {myVenue?.status === 'out' && myVenue.venue_name ? (
                <Pressable
                  onPress={() => openYapThread(myVenue.venue_name!)}
                  className="flex-row items-center gap-2 px-4 py-2 active:opacity-70"
                >
                  <SymbolView name="house" size={14} tintColor={NEON} />
                  <Text className="text-white text-[13px] font-sans-medium flex-1" numberOfLines={1}>
                    {myVenue.venue_name}
                  </Text>
                  <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.3)" />
                </Pressable>
              ) : null}
              {/* Hot / New sort */}
              <View className="flex-row items-center px-4 pb-1">
                {(
                  [
                    ['hot', 'Hot'],
                    ['new', 'New'],
                  ] as const
                ).map(([mode, label]) => (
                  <Pressable key={mode} onPress={() => setYapSort(mode)} className="mr-6 pb-1">
                    <Text
                      className="text-lg font-sans-semibold"
                      style={{ color: yapSort === mode ? '#ffffff' : 'rgba(255,255,255,0.4)' }}
                    >
                      {label}
                    </Text>
                    {yapSort === mode ? (
                      <View className="h-0.5 rounded-full" style={{ backgroundColor: NEON }} />
                    ) : null}
                  </Pressable>
                ))}
                <Text className="text-white/40 text-[11px] font-sans ml-auto">resets 5am</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            yapsLoading ? (
              <View className="px-4 gap-3 py-3">
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} className="h-24 rounded-2xl bg-[#2d1b4e]/40" />
                ))}
              </View>
            ) : (
              <View className="items-center justify-center py-16 px-8">
                <View className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 items-center justify-center mb-6">
                  <SymbolView name="mic" size={36} tintColor="rgba(168,85,247,0.6)" />
                </View>
                <Text className="text-xl font-sans-semibold text-white mb-2">
                  Nothing happening yet
                </Text>
                <Text className="text-white/50 text-sm font-sans text-center max-w-xs">
                  Live from the crowd — see what people are saying at venues tonight
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <YapRow quote={item} index={index} onPress={() => openYapThread(item.venue_name)} />
          )}
        />
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
