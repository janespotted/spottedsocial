import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { Image } from '@/components/styled';
import { router, useIsFocused } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import type { FeedPost } from '@/lib/posts';
import { registerFeedScroller, usePostDetail } from '@/lib/post-detail';
import { useQuery } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { useNoKeyboardOnFocus } from '@/hooks/use-dismiss-keyboard-on-leave';
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
// Plans moved out of Home into the Chat tab (client change, Sept 2026).
// Kept imported nowhere here on purpose — see app/(tabs)/(messages)/messages.tsx.
// import { PlansFeed } from '@/components/plans-feed';
import { Avatar } from '@/components/avatar';
import { HeaderActions } from '@/components/header-actions';
import { DayHome } from '@/components/day-home';
import { NightOpeningScreen } from '@/components/night-opening-screen';
import { SubTabs } from '@/components/sub-tabs';
import { useNightMode } from '@/hooks/use-night-mode';
import { FriendsOutPill } from '@/components/friends-out-pill';
import { NEON, PURPLE } from '@/lib/theme';

// `FeedMode` and the Newsfeed/Plans toggle were removed when Plans moved to
// the Chat tab (client change, Sept 2026). Home is the Newsfeed only.

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
            Live friend locations are hidden while you are Staying In. Shared posts, Plans and invitations remain available.
          </Text>
          <SymbolView name="chevron.right" size={12} tintColor={NEON} />
        </Pressable>
      ) : null}
      {friends.map((friend) => (
        <View
          key={friend.user_id}
          className="flex-row items-center gap-3 p-2.5 rounded-xl bg-white/5"
        >
          <View className="rounded-full border-2 border-[#d4ff00]">
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
            accessibilityRole="button"
            className="min-h-9 px-3.5 rounded-full items-center justify-center bg-[#d4ff00] active:opacity-80"
          >
            <Text className="text-[#1a0f2e] text-xs font-sans-semibold">Meet Up</Text>
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

/* ── Header ── */

/**
 * Static, like Map / Profile / Leaderboard. Home used to collapse a
 * "Newsfeed | Plans" title on scroll; with Plans moved to the Chat tab the
 * title named the only screen it could be, so it went and the collapse went
 * with it (there was nothing left worth animating). The wordmark, city pill
 * and actions were always anchored — they are unchanged.
 */
function HomeHeader({
  city,
  unreadCount,
  children,
}: {
  city: string | null;
  unreadCount: number;
  /** Day Mode's Morning After | Newsfeed tabs. */
  children?: ReactNode;
}) {
  return (
    <View
      className="pt-safe-offset-3 z-10"
      style={{
        backgroundColor: 'rgba(26, 15, 46, 0.95)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
      }}
    >
      <View className={`flex-row items-center justify-between px-4 h-10 ${children ? '' : 'mb-3'}`}>
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
      {children}
    </View>
  );
}

/* ── Screen ── */

/**
 * Night Mode: the Newsfeed, exactly as before. Day Mode (DAY-NIGHT-MODE-PLAN.md
 * §4.5): Morning After | Newsfeed tabs — the countdown, the recap card and
 * tonight's plans, with the Newsfeed showing its opening screen. The feed
 * (posts query, realtime channel) only mounts at night, and so does the Post
 * button: posting opens with Night Mode (D1).
 */
export default function HomeScreen() {
  const { isNight } = useNightMode();
  return isNight ? <NewsfeedScreen /> : <DayHomeScreen />;
}

type DayTab = 'morning' | 'feed';

function DayHomeScreen() {
  const { city } = useNightMode();
  const { unreadCount } = useNotifications();
  const [tab, setTab] = useState<DayTab>('morning');
  return (
    <View className="flex-1 bg-[#110a24]">
      <HomeHeader city={city} unreadCount={unreadCount}>
        <SubTabs<DayTab>
          tabs={[
            { key: 'morning', label: 'Morning After' },
            { key: 'feed', label: 'Newsfeed', icon: 'moon' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </HomeHeader>
      {tab === 'morning' ? <DayHome /> : <NightOpeningScreen kind="newsfeed" />}
    </View>
  );
}

function NewsfeedScreen() {
  useNoKeyboardOnFocus(); // back from comments / search must never leave the keyboard up
  const { session } = useSession();
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

  /**
   * `sent` shows the confirmation card (sendMeetUp alerts on failure). There
   * is no once-per-night limit: every Meet Up is its own card in the DM.
   */
  const handleMeetUp = async (friend: { user_id: string; display_name: string; avatar_url?: string | null }) => {
    if (!session) return;
    const result = await sendMeetUp(friend);
    if (result.status === 'sent') {
      router.push({
        pathname: '/sent-confirmation',
        params: {
          kind: 'meetup',
          friends: JSON.stringify([
            { id: friend.user_id, display_name: friend.display_name, avatar_url: friend.avatar_url ?? null },
          ]),
          // Undo withdraws the request; Chat opens the thread holding its card
          inviteIds: JSON.stringify([result.inviteId]),
          threadIds: JSON.stringify({ [friend.user_id]: result.threadId }),
        },
      });
    }
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

  // While a post detail is open one card's media lives on that screen; a
  // scroll here could recycle that row out from under it (POST-DETAIL-PLAN.md §4.5).
  const postDetailActive = usePostDetail((s) => s.phase !== 'idle');

  // Comment sheet over the feed: bring the post to the top of the list so
  // it sits above the sheet, as Instagram does. Programmatic scrolling still
  // works while user scrolling is locked.
  const listRef = useRef<LegendListRef>(null);
  const postsRef = useRef(feed.posts);
  postsRef.current = feed.posts;
  useEffect(() => {
    registerFeedScroller((postId) => {
      const index = postsRef.current.findIndex((p) => p.id === postId);
      if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true });
    });
    return () => registerFeedScroller(null);
  }, []);

  // One video plays at a time: the one most on screen, if at least half of
  // its row is. Measured from the list's own geometry rather than its
  // viewability callbacks — those report once from estimated sizes (every
  // row "100%") and not again until the first scroll, so a video below the
  // fold played at launch. Two 4:5 videos can both be half visible, so the
  // most visible wins. Decided at most every 150 ms; only the winning id
  // reaches state, so scrolling past images never re-renders.
  const [viewportVideoId, setViewportVideoId] = useState<string | null>(null);
  const listHeaderHeight = useRef(0);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickVisibleVideo = useCallback(() => {
    if (pickTimer.current) return;
    pickTimer.current = setTimeout(() => {
      pickTimer.current = null;
      const list = listRef.current?.getState();
      if (!list) return;
      // Item positions start below the list header
      const viewTop = list.scroll - listHeaderHeight.current;
      let best: { id: string; percent: number } | null = null;
      for (let i = Math.max(0, list.startBuffered); i <= list.endBuffered; i++) {
        const post = list.data[i] as FeedPost | undefined;
        const size = list.sizeAtIndex(i); // measured sizes only
        if (post?.media_type !== 'video' || !size) continue;
        const top = list.positionAtIndex(i) - viewTop;
        const percent = (100 * (Math.min(top + size, list.scrollLength) - Math.max(top, 0))) / size;
        if (percent >= 50 && (!best || percent > best.percent)) best = { id: post.id, percent };
      }
      setViewportVideoId(best?.id ?? null);
    }, 150);
  }, []);
  useEffect(() => {
    pickVisibleVideo();
  }, [feed.posts, pickVisibleVideo]);
  useEffect(
    () => () => {
      if (pickTimer.current) clearTimeout(pickTimer.current);
    },
    []
  );

  // Nothing plays behind another tab or a pushed screen — except the post
  // detail: the reel plays the teleported video (whichever was tapped), and
  // the comment sheet sits over a feed that is still on screen.
  const isFocused = useIsFocused();
  const reelPostId = usePostDetail((s) => (s.phase !== 'idle' && s.mode === 'reel' ? s.postId : null));
  const playingVideoId = reelPostId ?? (isFocused || postDetailActive ? viewportVideoId : null);

  return (
    <View className="flex-1 bg-[#110a24]">
      <HomeHeader city={city ?? null} unreadCount={unreadCount} />

      <LegendList
        ref={listRef}
        data={feed.posts}
        keyExtractor={(p) => p.id}
        recycleItems
        scrollEnabled={!postDetailActive}
        contentContainerStyle={contentContainerStyle}
        onEndReached={feed.loadMore}
        onEndReachedThreshold={0.5}
        onScroll={pickVisibleVideo}
        onLoad={pickVisibleVideo}
        onItemSizeChanged={pickVisibleVideo}
        // Rows only re-render when data or extraData change; without this
        // they never heard which video should play
        extraData={playingVideoId}
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
          // Always mounted (0 high when empty) so pickVisibleVideo knows
          // where the first row starts
          <View
            onLayout={(e) => {
              listHeaderHeight.current = e.nativeEvent.layout.height;
              pickVisibleVideo();
            }}
          >
            {isPlanning && outFriends.length > 0 ? (
              <View className="px-4 pt-4">
                <FriendsOutBanner count={outFriends.length} names={outFriends.map((f) => f.display_name)} />
              </View>
            ) : null}
          </View>
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
            isVisible={item.media_type !== 'video' || playingVideoId === item.id}
          />
        )}
      />

      {/* "N out · M TBD" roster pill — lower left, as in the original build
          (addendum v3 §11.1); the roster used to live only in the empty
          state, so it vanished the moment one post existed */}
      {!keyboardOpen ? (
        <View className="absolute bottom-safe-offset-16 left-4">
          <FriendsOutPill />
        </View>
      ) : null}

      {/* Compose FAB — bottom-safe-offset-16 clears the native tab bar
          (49pt) plus the home indicator, with a visible gap above it.
          Home is the Newsfeed only now, so the FAB is always "Post"; the
          Plan FAB moved to the Chat tab's Plans view. */}
      {keyboardOpen ? null : (
        <Pressable
          onPress={() => router.push('/create-post')}
          accessibilityRole="button"
          accessibilityLabel="New post"
          className="absolute bottom-safe-offset-16 right-4 h-14 pl-4 pr-5 rounded-full flex-row items-center gap-2 active:opacity-90"
          style={{
            backgroundColor: NEON,
            boxShadow: '0 4px 20px rgba(212, 255, 0, 0.35)',
          }}
        >
          <SymbolView name="camera.fill" size={20} tintColor="#1a0f2e" weight="semibold" />
          <Text className="text-[#1a0f2e] text-[15px] font-sans-semibold">Post</Text>
        </Pressable>
      )}
    </View>
  );
}
