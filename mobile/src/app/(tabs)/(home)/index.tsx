import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { Image } from '@/components/styled';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LegendList } from '@legendapp/list/react-native';
import { useQuery } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { sendMeetUp } from '@/lib/meet-up';
import { useSession } from '@/hooks/use-session';
import { useFeed } from '@/hooks/use-feed';
import { useFriendsOut, type FriendNightStatus } from '@/hooks/use-friends-out';
import { useNotifications } from '@/hooks/use-notifications';
import { PostCard } from '@/components/post-card';
import { PlansFeed } from '@/components/plans-feed';
import { Avatar } from '@/components/avatar';
import spottedLogo from '../../../../assets/images/spotted-s-logo.png';

const NEON = '#d4ff00';
const PURPLE = '#a855f7';

type FeedMode = 'newsfeed' | 'plans';

/* ── Out Tonight / Planning Tonight cards (shared: empty state + Plans) ── */

function OutTonightCard({
  friends,
  onMeetUp,
}: {
  friends: FriendNightStatus[];
  onMeetUp: (friend: FriendNightStatus) => void;
}) {
  if (friends.length === 0) return null;
  return (
    <View className="rounded-2xl bg-[#1a0a2e]/80 border border-white/10 p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <SymbolView name="mappin" size={16} tintColor={NEON} />
        <Text className="text-white font-sans-semibold text-sm">Out Tonight</Text>
        <Text className="text-white/40 text-xs font-sans">({friends.length})</Text>
      </View>
      {friends.map((friend) => (
        <View
          key={friend.user_id}
          className="flex-row items-center gap-3 p-2.5 rounded-xl bg-white/5"
        >
          <View className="rounded-full border-2 border-[#22c55e]">
            <Avatar name={friend.display_name} url={friend.avatar_url} size="sm" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
              {friend.display_name}
            </Text>
            <Text className="text-[#d4ff00] text-xs font-sans" numberOfLines={1}>
              {friend.venue_name ?? 'out somewhere'}
            </Text>
          </View>
          <Pressable
            onPress={() => onMeetUp(friend)}
            className="h-8 px-3 rounded-full items-center justify-center bg-[#22c55e] active:opacity-80"
          >
            <Text className="text-white text-xs font-sans-medium">Meet Up</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function PlanningTonightCard({ friends }: { friends: FriendNightStatus[] }) {
  if (friends.length === 0) return null;
  return (
    <View className="rounded-2xl bg-[#1a0a2e]/80 border border-white/10 p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <SymbolView name="target" size={16} tintColor={PURPLE} />
        <Text className="text-white font-sans-semibold text-sm">Planning Tonight</Text>
        <Text className="text-white/40 text-xs font-sans">({friends.length})</Text>
      </View>
      {friends.map((friend) => (
        <View
          key={friend.user_id}
          className="flex-row items-center gap-3 p-2.5 rounded-xl bg-white/5"
        >
          <View className="rounded-full border-2 border-white/20">
            <Avatar name={friend.display_name} url={friend.avatar_url} size="sm" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
              {friend.display_name}
            </Text>
            <Text className="text-white/50 text-xs font-sans" numberOfLines={1}>
              {friend.planning_venue_name
                ? `thinking ${friend.planning_venue_name}`
                : friend.planning_neighborhood
                  ? `TBD · ${friend.planning_neighborhood}`
                  : 'TBD · down for anything'}
            </Text>
          </View>
          <SymbolView name="bubble.left" size={20} tintColor="#ffffff" />
        </View>
      ))}
    </View>
  );
}

function EmptyFeed({
  outFriends,
  planningFriends,
  onMeetUp,
}: {
  outFriends: FriendNightStatus[];
  planningFriends: FriendNightStatus[];
  onMeetUp: (friend: FriendNightStatus) => void;
}) {
  const hour = new Date().getHours();
  const emptyTitle =
    hour < 12 ? "Who's up?" : hour < 17 ? "What's the move?" : hour < 21 ? "Night's young" : 'Nothing here yet';

  return (
    <View className="px-4 py-4 gap-6">
      <View className="items-center">
        <Pressable
          onPress={() => router.push('/create-post')}
          className="rounded-full px-6 py-2.5 active:opacity-90"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-[#1a0f2e] font-sans-medium">Share what you&apos;re up to</Text>
        </Pressable>
      </View>

      <OutTonightCard friends={outFriends} onMeetUp={onMeetUp} />
      <PlanningTonightCard friends={planningFriends} />

      {outFriends.length === 0 && planningFriends.length === 0 ? (
        <View className="items-center py-12">
          <View className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 items-center justify-center mb-6">
            <SymbolView name="bubble.left.and.bubble.right" size={40} tintColor="rgba(168,85,247,0.6)" />
          </View>
          <Text className="text-xl font-sans-semibold text-white mb-2">{emptyTitle}</Text>
          <Text className="text-white/50 text-sm font-sans">Share what you&apos;re up to</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ── Collapsing header ── */

function HomeHeader({
  scrollProgress: p,
  feedMode,
  onModeChange,
  city,
  unreadCount,
}: {
  scrollProgress: number;
  feedMode: FeedMode;
  onModeChange: (m: FeedMode) => void;
  city: string | null;
  unreadCount: number;
}) {
  return (
    <View
      className="pt-safe-offset-3 z-10"
      style={{ backgroundColor: `rgba(26, 15, 46, ${0.92 + p * 0.08})` }}
    >
      {/* Top bar — fixed size */}
      <View className="flex-row items-center justify-between px-4 h-10">
        <Text
          className="text-white font-sans-light"
          style={{ fontSize: 20 - p * 2, letterSpacing: (20 - p * 2) * 0.28 }}
        >
          Spotted
        </Text>
        <View className="flex-row items-center gap-2">
          {city ? (
            <View className="px-2.5 py-1 rounded-full bg-white/10">
              <Text className="text-white/70 text-xs font-sans-medium uppercase">{city}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => router.push('/search')}
            hitSlop={4}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-70"
          >
            <SymbolView name="magnifyingglass" size={18} tintColor="rgba(255,255,255,0.6)" />
          </Pressable>
          <Pressable
            onPress={() => router.push('/activity')}
            hitSlop={4}
            className="w-9 h-9 rounded-full items-center justify-center active:opacity-90"
            style={{ backgroundColor: PURPLE }}
          >
            <SymbolView name="bell" size={18} tintColor="#ffffff" />
            {unreadCount > 0 ? (
              <View className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 items-center justify-center">
                <Text className="text-white text-[9px] font-sans-semibold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => router.push('/check-in')}
            hitSlop={4}
            className="active:scale-110"
          >
            <Image source={spottedLogo} className="h-9 w-9" contentFit="contain" />
          </Pressable>
        </View>
      </View>

      {/* Tabs — large title that collapses on scroll */}
      <View
        className="flex-row items-end px-4"
        style={{
          paddingTop: 12 - p * 6,
          paddingBottom: 12 - p * 6,
          borderBottomWidth: 1,
          borderBottomColor: `rgba(255, 255, 255, ${0.04 + p * 0.04})`,
        }}
      >
        {(['newsfeed', 'plans'] as const).map((mode) => (
          <Pressable key={mode} onPress={() => onModeChange(mode)} className="mr-6">
            <Text
              className="font-sans-semibold text-white"
              style={{
                fontSize: 24 - p * 11,
                lineHeight: (24 - p * 11) * 1.2,
                opacity: feedMode === mode ? 1 : 0.4 + p * 0.1,
              }}
            >
              {mode === 'newsfeed' ? 'Newsfeed' : 'Plans'}
            </Text>
            {feedMode === mode ? (
              <View
                className="rounded-full"
                style={{ height: 2.5 - p * 0.5, backgroundColor: NEON, marginTop: 2 }}
              />
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ── Screen ── */

export default function HomeScreen() {
  const { session } = useSession();
  const [feedMode, setFeedMode] = useState<FeedMode>('newsfeed');
  const [scrollProgress, setScrollProgress] = useState(0);
  const feed = useFeed();
  const { data: friendsData, refetch: refetchFriends } = useFriendsOut();
  const { unreadCount } = useNotifications();
  const contentContainerStyle = useResolveClassNames('pb-6');

  const { data: city } = useQuery({
    queryKey: ['home-city', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('home_city')
        .eq('id', session!.user.id)
        .maybeSingle();
      return data?.home_city ?? 'nyc';
    },
  });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    // Short content can't fund the collapse: shrinking the header grows the
    // viewport, iOS clamps the offset back, the header re-expands — a jitter
    // loop. Only collapse when there's comfortably more scroll room than the
    // 40px threshold plus the ~26px the header gives up.
    const scrollable = contentSize.height - layoutMeasurement.height;
    if (scrollable < 80) {
      setScrollProgress((prev) => (prev === 0 ? prev : 0));
      return;
    }
    const next = Math.min(1, Math.max(0, contentOffset.y / 40));
    setScrollProgress((prev) => (Math.abs(prev - next) > 0.02 ? next : prev));
  };

  const handleMeetUp = (friend: FriendNightStatus) => {
    if (!session) return;
    sendMeetUp(session.user.id, friend);
  };

  // Hide the FAB while the keyboard is up (parity with the web CreatePostFab)
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const outFriends = friendsData?.outFriends ?? [];
  const planningFriends = friendsData?.planningFriends ?? [];

  // Viewport-based video pause: track which video posts are ≥50% on screen.
  // Only video ids go in the set so image-only scrolling never re-renders.
  const [visibleVideoIds, setVisibleVideoIds] = useState<Set<string>>(new Set());
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const next = new Set<string>();
      for (const token of viewableItems) {
        const item = token.item as { id?: string; media_type?: string | null } | null;
        if (token.isViewable && item?.media_type === 'video' && item.id) next.add(item.id);
      }
      setVisibleVideoIds((prev) => {
        if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
        return next;
      });
    }
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  return (
    <View className="flex-1 bg-[#110a24]">
      <HomeHeader
        scrollProgress={scrollProgress}
        feedMode={feedMode}
        onModeChange={setFeedMode}
        city={city ?? null}
        unreadCount={unreadCount}
      />

      {feedMode === 'plans' ? (
        <PlansFeed city={city ?? null} onScroll={onScroll} />
      ) : (
        <LegendList
          data={feed.posts}
          keyExtractor={(p) => p.id}
          recycleItems
          contentContainerStyle={contentContainerStyle}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReached={feed.loadMore}
          onEndReachedThreshold={0.5}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshControl={
            <RefreshControl
              refreshing={feed.isRefreshing}
              onRefresh={() => {
                feed.refresh();
                refetchFriends();
              }}
              tintColorClassName="accent-[#d4ff00]"
            />
          }
          ListFooterComponent={
            feed.posts.length === 0 ? null : feed.hasMore ? (
              <View className="py-6 items-center">
                <ActivityIndicator color={NEON} />
              </View>
            ) : (
              <Text className="text-white/30 text-xs font-sans text-center py-6">
                you&apos;re all caught up
              </Text>
            )
          }
          ListEmptyComponent={
            feed.isLoading ? (
              <View className="px-4 py-8 gap-4">
                {[0, 1].map((i) => (
                  <View key={i} className="gap-3">
                    <View className="flex-row items-center gap-2.5">
                      <View className="w-8 h-8 rounded-full bg-white/10" />
                      <View className="h-3 w-28 rounded bg-white/10" />
                    </View>
                    <View className="h-64 rounded-xl bg-white/5" />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyFeed
                outFriends={outFriends}
                planningFriends={planningFriends}
                onMeetUp={handleMeetUp}
              />
            )
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              isLiked={feed.likedPosts.has(item.id)}
              currentUserId={session?.user.id ?? ''}
              onToggleLike={feed.toggleLike}
              onDelete={feed.deletePost}
              isVisible={item.media_type !== 'video' || visibleVideoIds.has(item.id)}
            />
          )}
        />
      )}

      {/* Compose FAB — bottom-safe-offset-16 clears the native tab bar
          (49pt) plus the home indicator, with a visible gap above it */}
      {keyboardOpen ? null : (
      <Pressable
        onPress={() => router.push('/create-post')}
        className="absolute bottom-safe-offset-16 right-4 w-14 h-14 rounded-full items-center justify-center active:opacity-90"
        style={{
          backgroundColor: NEON,
          boxShadow: '0 4px 20px rgba(212, 255, 0, 0.35)',
        }}
      >
        <SymbolView name="plus" size={24} tintColor="#1a0f2e" weight="semibold" />
      </Pressable>
      )}
    </View>
  );
}
