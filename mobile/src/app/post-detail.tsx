import { useEffect, useRef } from 'react';
import {
  ActionSheetIOS,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { PortalHost } from 'react-native-teleport';
import {
  ReanimatedTrueSheetProvider,
  useReanimatedTrueSheet,
} from '@lodev09/react-native-true-sheet/reanimated';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommentSheet, type CommentSheetHandle } from '@/components/comment-sheet';
import { ExpiredState } from '@/components/empty-state';
import { GradientRingAvatar } from '@/components/post-card';
import { FEED_MEDIA_ASPECT, PostMedia, postHasMedia } from '@/components/post-media';
import { getTimeAgo } from '@/hooks/use-feed';
import { useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { useSession } from '@/hooks/use-session';
import { openFriendCard } from '@/lib/friend-card';
import { blockUser, reportContent } from '@/lib/moderation';
import {
  POST_DETAIL_HOST,
  closePostDetail,
  playPostDetailOpen,
  postDetailProgress,
  usePostDetail,
} from '@/lib/post-detail';
import { fetchPostById, type FeedPost } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { NEON, PURPLE } from '@/lib/theme';

/**
 * Post detail (POST-DETAIL-PLAN.md), two Instagram surfaces in one route:
 *
 * - **Reel** (tap a video): a transparent modal with no native animation.
 *   The feed card's media is teleported into the PortalHost here and this
 *   screen animates the host's wrapper from the card's frame to the full
 *   window, then back on close — the video never stops. When the comment
 *   sheet rises the wrapper shrinks into a 4:5 box above it, exactly the
 *   way Instagram tucks a Reel above its comments.
 * - **Sheet** (comment icon on any post): only the comment sheet, over the
 *   feed, which stays visible through the transparent modal and has
 *   scrolled the post up into view. Nothing is teleported.
 *
 * Opened by a push or link (nothing to teleport): fetches the post, renders
 * its own media inline, and skips the fly.
 *
 * The comment sheet is a native sheet (True Sheet); its top edge reaches
 * the reel as a shared value through ReanimatedTrueSheetProvider, which is
 * why the screen is split in two here.
 */
export default function PostDetailScreen() {
  return (
    <ReanimatedTrueSheetProvider>
      <PostDetail />
    </ReanimatedTrueSheetProvider>
  );
}

function PostDetail() {
  useDismissKeyboardOnLeave();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { session } = useSession();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const phase = usePostDetail((s) => s.phase);
  const mode = usePostDetail((s) => s.mode);
  const storePostId = usePostDetail((s) => s.postId);
  const origin = usePostDetail((s) => s.origin);
  const handedPost = usePostDetail((s) => s.post);
  const handedLiked = usePostDetail((s) => s.isLiked);
  const toggleLike = usePostDetail((s) => s.toggleLike);
  const deletePost = usePostDetail((s) => s.deletePost);

  const handedOver = storePostId === postId && !!handedPost;
  const sheetOnly = handedOver && mode === 'sheet';
  const teleported = handedOver && mode === 'reel' && !!origin;

  // Deep-link path: nothing handed over, fetch the post ourselves.
  const fetched = useQuery({
    queryKey: ['post-detail', postId],
    enabled: !!postId && !!session && !handedOver,
    queryFn: () => fetchPostById(postId!, session!.user.id),
  });
  const post: FeedPost | null = handedOver ? handedPost : (fetched.data?.post ?? null);
  const isLiked = handedOver ? handedLiked : (fetched.data?.isLiked ?? false);
  const expired = !handedOver && fetched.isSuccess && fetched.data === null;

  // Start the fly once the host is mounted and painted at the card's frame.
  // Without a teleport there is nothing to fly: land at 1 immediately.
  useEffect(() => {
    if (teleported) {
      const id = requestAnimationFrame(() => playPostDetailOpen());
      return () => cancelAnimationFrame(id);
    }
    postDetailProgress.value = 1;
    if (phase === 'opening') playPostDetailOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teleported]);

  const sheetRef = useRef<CommentSheetHandle>(null);

  // Idempotent: the sheet's dismissal and the back chevron can both land.
  // The native sheet is a view controller presented on top of this modal
  // route, so it must be gone BEFORE the route goes (True Sheet's
  // documented blank-screen trap); dismiss() is a no-op when it is not up.
  const closing = useRef(false);
  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    await sheetRef.current?.dismiss();
    if (storePostId === postId && phase !== 'idle') closePostDetail({ animated: teleported });
    else router.back();
  };

  // Android hardware back reverses the fly instead of popping under it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storePostId, phase, teleported]);

  /* ── Reel frame: fly (progress) blended with the box above the sheet ── */
  // The native sheet's top edge, screen coordinates, on the UI thread;
  // window height while the sheet is down.
  const { animatedPosition: sheetTop } = useReanimatedTrueSheet();

  const originY = origin?.y ?? 0;
  const originH = origin?.height ?? height;
  const hostStyle = useAnimatedStyle(() => {
    const p = postDetailProgress.value;
    const flyTop = interpolate(p, [0, 1], [originY, 0]);
    const flyH = interpolate(p, [0, 1], [originH, height]);

    // k: how far the reel has tucked into its box. 0 with the sheet closed;
    // reaches 1 well before the sheet's first snap so the box is formed by
    // the time the sheet settles, then tracks the sheet edge continuously.
    const s = sheetTop.value;
    const closed = s <= 0 || s >= height;
    const k = closed ? 0 : Math.min(1, Math.max(0, (height - s) / (0.35 * height)));

    // The box: the media's own 4:5, as tall as the room above the sheet
    // allows, never wider than the window minus a margin, centred.
    const boxTop = insets.top + 8;
    const room = Math.max(72, s - boxTop - 12);
    let boxH = room;
    let boxW = boxH / FEED_MEDIA_ASPECT;
    const maxW = width - 32;
    if (boxW > maxW) {
      boxW = maxW;
      boxH = boxW * FEED_MEDIA_ASPECT;
    }
    const boxLeft = (width - boxW) / 2;

    return {
      top: flyTop + (boxTop - flyTop) * k,
      height: flyH + (boxH - flyH) * k,
      left: boxLeft * k,
      width: width + (boxW - width) * k,
      borderRadius: 14 * k,
    };
  });
  const backdropStyle = useAnimatedStyle(() => ({ opacity: postDetailProgress.value }));
  // Chrome fades with the fly and again as the sheet takes the screen.
  const chromeStyle = useAnimatedStyle(() => {
    const s = sheetTop.value;
    const closed = s <= 0 || s >= height;
    const k = closed ? 0 : Math.min(1, Math.max(0, (height - s) / (0.2 * height)));
    return { opacity: postDetailProgress.value * (1 - k) };
  });

  /* ── Actions ── */
  const isOwner = !!post && post.user_id === session?.user.id;
  const onLike = () => {
    if (!post) return;
    if (toggleLike) toggleLike(post.id);
    else void toggleLikeStandalone(post, isLiked, session?.user.id);
  };
  const onShare = () => {
    if (!post) return;
    router.push({
      pathname: '/share-post',
      params: { postId: post.id, authorId: post.user_id, authorName: post.display_name },
    });
  };
  const onMenu = () => {
    if (!post || !session) return;
    if (isOwner) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Delete Post', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (index) => {
          if (index !== 0) return;
          // Leave first: deleting drops the feed row, and with it the Portal
          // that owns the media on this screen.
          closing.current = true;
          void sheetRef.current?.dismiss().then(() => {
            closePostDetail({ animated: false });
            deletePost?.(post.id);
          });
        }
      );
    } else {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Report Post', `Block ${post.display_name}`, 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) reportContent(session.user.id, { type: 'post', id: post.id });
          if (index === 1) blockUser(session.user.id, post.user_id, post.display_name);
        }
      );
    }
  };

  /* ── Sheet mode: just the comments, over the feed ── */
  if (sheetOnly && post) {
    return (
      <View className="flex-1">
        <CommentSheet
          ref={sheetRef}
          postId={post.id}
          authorName={post.display_name}
          mode="sheet"
          onDismissed={() => void close()}
          onExpired={() => void close()}
        />
      </View>
    );
  }

  const chromeInteractive = phase === 'open' || !teleported;

  // Height reserved for the "Add comment…" bar at the bottom edge, which
  // the scrim, the author block and the rail all sit above. The bar is
  // parked (see below), so nothing is reserved and the chrome clears the
  // home indicator itself. With the bar back this is
  // `16 + 20 + insets.bottom + 16` — pt-4, one 15pt line, its padding.
  const commentBarHeight = insets.bottom;

  return (
    <View className="flex-1">
      {/* 1. Black behind the reel, fading in with the fly */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, backdropStyle]}
      />

      {/* 2. The reel: a host wrapper that starts at the card's frame */}
      <Animated.View
        style={[
          { position: 'absolute', overflow: 'hidden', backgroundColor: '#000' },
          hostStyle,
        ]}
      >
        {teleported ? (
          <PortalHost name={POST_DETAIL_HOST} style={{ flex: 1 }} />
        ) : post && postHasMedia(post) ? (
          <PostMedia post={post} />
        ) : null}
      </Animated.View>

      {/* 3. Chrome overlaid on the reel */}
      <Animated.View
        pointerEvents={chromeInteractive ? 'box-none' : 'none'}
        style={[StyleSheet.absoluteFill, chromeStyle]}
      >
        {/* Top bar */}
        <View
          className="flex-row items-center px-3"
          style={{ paddingTop: insets.top + 4 }}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => void close()}
            hitSlop={12}
            accessibilityLabel="Back"
            className="w-10 h-10 rounded-full bg-black/40 items-center justify-center active:opacity-70"
          >
            <SymbolView name="chevron.left" size={18} tintColor="#ffffff" weight="semibold" />
          </Pressable>
        </View>

        {expired ? (
          <View className="flex-1 justify-center">
            <ExpiredState what="This post" onDismiss={() => void close()} dismissLabel="Back" />
          </View>
        ) : null}

        {post ? (
          <>
            {/* Bottom scrim, carrying the author block and the rail. It
                runs to the bottom edge while the comment bar is parked; with
                the bar back it should stop at `commentBarHeight` and land on
                INK_LIGHT instead of black, or it bands against the bar. */}
            <View
              pointerEvents="none"
              className="absolute left-0 right-0 bottom-0"
              style={{
                height: 260 + insets.bottom,
                experimental_backgroundImage:
                  'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
              }}
            />

            {/* Author + caption, bottom-left */}
            <View
              className="absolute left-0 gap-2 pl-4 pr-20"
              style={{ bottom: commentBarHeight + 16 }}
              pointerEvents="box-none"
            >
              <View className="flex-row items-center gap-2.5">
                <Pressable
                  onPress={() => openFriendCard(post.user_id, session?.user.id)}
                  hitSlop={4}
                  className="active:opacity-70"
                >
                  <GradientRingAvatar name={post.display_name} url={post.avatar_url} />
                </Pressable>
                <View className="flex-1 min-w-0">
                  <Pressable
                    onPress={() => openFriendCard(post.user_id, session?.user.id)}
                    hitSlop={4}
                    className="active:opacity-70"
                  >
                    <Text className="font-sans-semibold text-white text-sm">
                      {post.display_name}
                    </Text>
                  </Pressable>
                  <Text className="text-white/60 text-xs font-sans" numberOfLines={1}>
                    {post.venue_name ? (
                      <Text className="text-[#d4ff00] font-sans-medium">@{post.venue_name} · </Text>
                    ) : null}
                    {getTimeAgo(post.created_at)} · until 5am
                  </Text>
                </View>
              </View>
              {post.text ? (
                <Text className="text-white text-sm font-sans leading-snug" numberOfLines={4}>
                  {post.text}
                </Text>
              ) : null}
              {post.tags.length > 0 ? (
                <View className="flex-row flex-wrap items-center">
                  <SymbolView name="person.2.fill" size={11} tintColor="rgba(255,255,255,0.6)" />
                  <Text className="text-white/60 text-xs font-sans ml-1.5">with </Text>
                  {post.tags.map((t, i) => (
                    <Text key={t.id}>
                      <Text
                        className="text-xs font-sans-medium"
                        style={{ color: PURPLE }}
                        onPress={() => openFriendCard(t.id, session?.user.id)}
                      >
                        {t.display_name.split(' ')[0]}
                      </Text>
                      {i < post.tags.length - 1 ? (
                        <Text className="text-white/60 text-xs font-sans">
                          {i === post.tags.length - 2 ? ' and ' : ', '}
                        </Text>
                      ) : null}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Action rail, bottom-right */}
            <View
              className="absolute right-3 items-center gap-5"
              style={{ bottom: commentBarHeight + 16 }}
              pointerEvents="box-none"
            >
              <RailButton
                icon={isLiked ? 'heart.fill' : 'heart'}
                tint={isLiked ? NEON : '#ffffff'}
                label={post.likes_count > 0 ? String(post.likes_count) : undefined}
                accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                onPress={onLike}
              />
              <RailButton
                icon="bubble.right"
                label={post.comments_count > 0 ? String(post.comments_count) : undefined}
                accessibilityLabel="Comments"
                onPress={() => sheetRef.current?.open()}
              />
              <RailButton icon="paperplane" accessibilityLabel="Share" onPress={onShare} />
              <RailButton icon="ellipsis" accessibilityLabel="More" onPress={onMenu} />
            </View>

            {/* "Add comment…" bar — PARKED, not deleted (Sept 2026). The
                reel's comment rail already opens the sheet; the bar is here
                for when we want Instagram's always-visible composer entry.
                Restoring it: uncomment this, re-import INK_LIGHT, and set
                commentBarHeight back to a real height — that re-seats the
                scrim, the author block and the rail above it.

            <Pressable
              onPress={() => sheetRef.current?.open({ focus: true })}
              accessibilityLabel="Add comment"
              className="absolute left-0 right-0 bottom-0 px-5 pt-4 active:opacity-80"
              style={{
                paddingBottom: insets.bottom + 16,
                backgroundColor: INK_LIGHT,
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <Text className="text-white/60 text-[15px] font-sans">Add comment…</Text>
            </Pressable>
            */}
          </>
        ) : null}
      </Animated.View>

      {/* 4. Comments over the reel, presented on demand from the rail */}
      {post && !expired ? (
        <CommentSheet
          ref={sheetRef}
          postId={post.id}
          authorName={post.display_name}
          mode="reel"
          onExpired={() => void close()}
        />
      ) : null}
    </View>
  );
}

function RailButton({
  icon,
  tint = '#ffffff',
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: 'heart' | 'heart.fill' | 'bubble.right' | 'paperplane' | 'ellipsis';
  tint?: string;
  label?: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      className="items-center gap-1 active:scale-90"
    >
      <SymbolView name={icon} size={28} tintColor={tint} />
      {label ? <Text className="text-white text-xs font-sans-semibold">{label}</Text> : null}
    </Pressable>
  );
}

/**
 * Like/unlike when the feed did not hand over its toggle (deep-link path).
 * No optimistic UI here: the count comes from the fetched post and the
 * next open reflects it.
 */
async function toggleLikeStandalone(post: FeedPost, isLiked: boolean, userId: string | undefined) {
  if (!userId) return;
  if (isLiked) {
    await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', userId);
  } else {
    await supabase.from('post_likes').insert({ post_id: post.id, user_id: userId });
  }
}
