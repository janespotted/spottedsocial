import { useWindowDimensions } from 'react-native';
import { TabHeaderRow } from '@/components/tab-header-row';
import { CaptureGuard } from '@/components/capture-guard';
import { ModeCountdownStrip } from '@/components/mode-countdown-strip';
import { CompactRecapEntry } from '@/components/compact-recap-entry';
import { friendCardPress } from '@/lib/friend-card';
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
import { useResolveClassNames } from 'uniwind';
import { useNoKeyboardOnFocus } from '@/hooks/use-dismiss-keyboard-on-leave';
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
import { ForTonight } from '@/components/venue-recommendations';
import { HomePlansPreview } from '@/components/home-plans-preview';
import { useQueryClient } from '@tanstack/react-query';
import { PostCard } from '@/components/post-card';
// Empty Home previews shared plans; the full Plans feed stays in Chat.
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
  /** Never render cached identities for a viewer who chose No. */
  venuesWithheld?: boolean;
}) {
  if (venuesWithheld || friends.length === 0) return null;
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
            Check in as TBD or Out to see who’s out.
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
            <Avatar userId={friend.user_id} name={friend.display_name} url={friend.avatar_url} size="sm" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-white font-sans-medium text-sm" numberOfLines={1} onPress={friendCardPress(friend.user_id)} accessibilityRole="button">
              {friend.display_name}
            </Text>
            <Text className="text-[#d4ff00] text-xs font-sans" numberOfLines={1}>
              {friend.venue_name ?? (venuesWithheld ? 'Out tonight' : 'out somewhere')}
            </Text>
          </View>
          <Pressable
            onPress={() => onMeetUp(friend)}
            accessibilityRole="button"
            className="min-h-11 px-3.5 rounded-full items-center justify-center bg-[#d4ff00] active:opacity-80"
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
            <Avatar userId={friend.user_id} name={friend.display_name} url={friend.avatar_url} size="sm" />
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-white font-sans-medium text-sm" numberOfLines={1} onPress={friendCardPress(friend.user_id)} accessibilityRole="button">
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
 * friends but nothing posted → real activity, shared plans, nightlife picks, then Post.
 * With posts present, recommendations appear only after the last loaded page.
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
  return (
    <View className="py-4 gap-6">
      {friendCount === 0 ? <View className="px-4"><EmptyState compact icon="person.2" title="Find your people" body="Your friends’ nights start here." actions={addFriendsActions()} /></View> : !venuesWithheld && (outFriends.length > 0 || planningFriends.length > 0) ? <View className="px-4 gap-4">
        <OutTonightCard friends={outFriends} onMeetUp={onMeetUp} venuesWithheld={venuesWithheld} />
        <PlanningTonightCard friends={planningFriends} />
      </View> : null}
      <ForTonight />
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
  /** The Morning After | Newsfeed tabs. */
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
      <TabHeaderRow city={city} unreadCount={unreadCount} />
      {children}
    </View>
  );
}

/* ── Screen ── */

/**
 * Day opens on Morning After, with the Newsfeed showing its opening screen.
 * At night Home shows only the live Newsfeed; Morning After stays available
 * through the compact link on Profile. The feed (posts query, realtime channel)
 * only mounts at night, and so does the Post button: posting opens with
 * Night Mode (D1).
 */
function HomeScreenContent() {
  const { isNight, city } = useNightMode();
  const { unreadCount } = useNotifications();
  return (
    <View className="flex-1 bg-[#110a24]">
      <HomeHeader city={city} unreadCount={unreadCount}><ModeCountdownStrip /></HomeHeader>
      {isNight ? <NewsfeedScreen active /> : <DayHome />}
    </View>
  );
}

/** The live feed, its roster pill and the Post button. `active` = its tab is showing. */
function NewsfeedScreen({ active }: { active: boolean }) {
  const { fontScale } = useWindowDimensions();
  useNoKeyboardOnFocus(); // back from comments / search must never leave the keyboard up
  const { session } = useSession();
  const feed = useFeed();
  const queryClient = useQueryClient();
  const { data: friendsData, refetch: refetchFriends } = useFriendsOut();
  const friendsQuery = useFriendIds(session?.user.id);
  const friendIds = friendsQuery.data;
  const { data: ownNight } = useOwnNightStatus();
  const isPlanning = ownNight?.status?.status === 'planning';
  // pb clears the native tab bar, home indicator and the Post FAB
  const contentContainerStyle = useResolveClassNames('pb-36');

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

  // Nothing plays behind another tab, Morning After or a pushed screen —
  // except the post detail: the reel plays the teleported video (whichever
  // was tapped), and the comment sheet sits over a feed that is still on
  // screen.
  const isFocused = useIsFocused();
  const reelPostId = usePostDetail((s) => (s.phase !== 'idle' && s.mode === 'reel' ? s.postId : null));
  const playingVideoId = !active
    ? null
    : (reelPostId ?? (isFocused || postDetailActive ? viewportVideoId : null));

  return (
    <View key={fontScale} className="flex-1">
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
              void queryClient.invalidateQueries({ queryKey: ['plans', session?.user.id] });
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
            <View className="pt-6">
              <ForTonight />
              <Text className="text-white/45 text-xs font-sans text-center py-6">you&apos;re all caught up</Text>
            </View>
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
            <View className="pt-4 pb-3 gap-4"><HomePlansPreview /><CompactRecapEntry /></View>
            {isPlanning && outFriends.length > 0 ? (
              <View className="px-4 pt-4">
                <FriendsOutBanner count={outFriends.length} friends={outFriends} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          feed.isLoading || (feed.posts.length === 0 && friendsQuery.isLoading) ? (
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
          ) : feed.isError || (feed.posts.length === 0 && friendsQuery.isError) ? (
            <ErrorState
              title="Couldn't load your feed"
              onRetry={() => { void feed.refresh({ userInitiated: true }); void friendsQuery.refetch(); }}
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

      {/* "N out · M TBD" roster pill — lower right, clear of the always-visible Post button
          (addendum v3 §11.1); the roster used to live only in the empty
          state, so it vanished the moment one post existed */}
      {!keyboardOpen ? (
        <View className="absolute bottom-safe-offset-16 right-4">
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
          className="absolute bottom-safe-offset-16 left-4 h-14 pl-4 pr-5 rounded-full flex-row items-center gap-2 active:opacity-90"
          style={{
            backgroundColor: NEON,
            boxShadow: '0 4px 20px rgba(212, 255, 0, 0.2)',
          }}
        >
          <SymbolView name="camera.fill" size={20} tintColor="#1a0f2e" weight="semibold" />
          <Text className="text-[15px] font-sans-semibold text-[#1a0f2e]">Post</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function HomeScreen() { return <CaptureGuard name="newsfeed"><HomeScreenContent /></CaptureGuard>; }
