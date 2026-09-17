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
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { useNotifications } from '@/hooks/use-notifications';
import { EmptyState, ErrorState } from '@/components/empty-state';
import { addFriendsActions } from '@/lib/add-friends';
import { FriendsOutBanner } from '@/components/friends-out-banner';
import { PostCard } from '@/components/post-card';
import { PlansFeed } from '@/components/plans-feed';
import { Avatar } from '@/components/avatar';
import { HeaderActions } from '@/components/header-actions';
import { NEON, PURPLE } from '@/lib/theme';

type FeedMode = 'newsfeed' | 'plans';

/* ── Out Tonight / Planning Tonight cards (shared: empty state + Plans) ── */

function OutTonightCard({
  friends,
  onMeetUp,
  venuesWithheld = false,
}: {
  friends: FriendNightStatus[];
  onMeetUp: (friend: FriendNightStatus) => void;
  /** Viewer said "No" tonight: names only, no venues, with the way back in. */
  venuesWithheld?: boolean;
}) {
  if (friends.length === 0) return null;
  return (
    <View className="rounded-2xl bg-[#1a0a2e]/80 border border-white/10 p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <SymbolView name="mappin" size={16} tintColor={NEON} />
        <Text className="text-white font-sans-semibold text-sm">Out Tonight</Text>
        <Text className="text-white/55 text-xs font-sans">({friends.length})</Text>
      </View>
      {venuesWithheld ? (
        <Pressable
          onPress={() => router.push('/check-in')}
          accessibilityRole="button"
          className="flex-row items-center gap-2 rounded-xl px-3 py-2.5 active:opacity-80"
          style={{ backgroundColor: 'rgba(212,255,0,0.08)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)' }}
        >
          <Text className="flex-1 text-white/75 text-xs font-sans leading-4">
            You&apos;re staying in, so venues are hidden. Going out after all? Update your status.
          </Text>
          <SymbolView name="chevron.right" size={12} tintColor={NEON} />
        </Pressable>
      ) : null}
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
              {friend.venue_name ?? (venuesWithheld ? 'Out tonight' : 'out somewhere')}
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
        <Text className="text-white font-sans-semibold text-sm">TBD Tonight</Text>
        <Text className="text-white/55 text-xs font-sans">({friends.length})</Text>
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

/**
 * Empty feed, by situation (client feedback §8): no friends → add some;
 * friends but nothing posted → say so and offer to post. Friends who are
 * out or TBD still show above, so an empty feed is never a dead end.
 */
function EmptyFeed({
  friendCount,
  outFriends,
  planningFriends,
  venuesWithheld,
  onMeetUp,
}: {
  friendCount: number;
  outFriends: FriendNightStatus[];
  planningFriends: FriendNightStatus[];
  venuesWithheld: boolean;
  onMeetUp: (friend: FriendNightStatus) => void;
}) {
  if (friendCount === 0) {
    return (
      <EmptyState
        icon="person.2"
        title="Add friends to see their nights"
        body="Posts from your friends show up here until 5 AM. Find people you know to get started."
        actions={[
          ...addFriendsActions(),
          { label: 'Post something', icon: 'camera.fill', onPress: () => router.push('/create-post') },
        ]}
      />
    );
  }

  const nobodyAround = outFriends.length === 0 && planningFriends.length === 0;
  return (
    <View className="px-4 py-4 gap-6">
      <OutTonightCard friends={outFriends} onMeetUp={onMeetUp} venuesWithheld={venuesWithheld} />
      <PlanningTonightCard friends={planningFriends} />

      <EmptyState
        icon={nobodyAround ? 'moon.stars' : 'camera'}
        title={nobodyAround ? 'Nothing from your circle yet' : 'No posts yet tonight'}
        body={
          nobodyAround
            ? "None of your friends have posted or shared a plan tonight. Posts live here until 5 AM — be the first."
            : 'Friends are around, but nobody has posted yet. Start it off.'
        }
        actions={[
          { label: "Share what you're up to", icon: 'camera.fill', primary: true, onPress: () => router.push('/create-post') },
        ]}
        compact={!nobodyAround}
      />
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
        {/* Wordmark is anchored: same size on every tab, never animates */}
        <Text
          className="text-white font-sans-light"
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 20, letterSpacing: 20 * 0.28 }}
        >
          Spotted
        </Text>
        <View className="flex-row items-center gap-2">
          {city ? (
            <View className="px-2.5 py-1 rounded-full bg-white/10">
              <Text className="text-white/70 text-xs font-sans-medium uppercase">{city}</Text>
            </View>
          ) : null}
          <HeaderActions unreadCount={unreadCount} />
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
  const { data: friendIds } = useFriendIds(session?.user.id);
  const { data: ownNight } = useOwnNightStatus();
  const isPlanning = ownNight?.status?.status === 'planning';
  const { unreadCount } = useNotifications();
  // pb clears the native tab bar, home indicator and the Post FAB
  const contentContainerStyle = useResolveClassNames('pb-36');

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
                feed.refresh({ userInitiated: true });
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
              <Text className="text-white/45 text-xs font-sans text-center py-6">
                you&apos;re all caught up
              </Text>
            )
          }
          ListHeaderComponent={
            isPlanning && outFriends.length > 0 ? (
              <View className="px-4 pt-4">
                <FriendsOutBanner count={outFriends.length} names={outFriends.map((f) => f.display_name)} />
              </View>
            ) : null
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
            ) : feed.isError ? (
              <ErrorState
                title="Couldn't load your feed"
                onRetry={() => void feed.refresh({ userInitiated: true })}
                retrying={feed.isRefreshing}
              />
            ) : (
              <EmptyFeed
                friendCount={friendIds?.length ?? 0}
                outFriends={outFriends}
                planningFriends={planningFriends}
                venuesWithheld={friendsData?.venuesWithheld ?? false}
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
          (49pt) plus the home indicator, with a visible gap above it.
          Labelled per view (client feedback §6): a bare "+" over Plans used
          to open the photo composer. */}
      {keyboardOpen ? null : (
      <Pressable
        onPress={() => router.push(feedMode === 'plans' ? '/create-plan' : '/create-post')}
        accessibilityRole="button"
        accessibilityLabel={feedMode === 'plans' ? 'Share a plan' : 'New post'}
        className="absolute bottom-safe-offset-16 right-4 h-14 pl-4 pr-5 rounded-full flex-row items-center gap-2 active:opacity-90"
        style={{
          backgroundColor: NEON,
          boxShadow: '0 4px 20px rgba(212, 255, 0, 0.35)',
        }}
      >
        <SymbolView
          name={feedMode === 'plans' ? 'calendar.badge.plus' : 'camera.fill'}
          size={20}
          tintColor="#1a0f2e"
          weight="semibold"
        />
        <Text className="text-[#1a0f2e] text-[15px] font-sans-semibold">
          {feedMode === 'plans' ? 'Plan' : 'Post'}
        </Text>
      </Pressable>
      )}
    </View>
  );
}
