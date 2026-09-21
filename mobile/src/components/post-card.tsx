import { useEffect, useRef } from 'react';
import { ActionSheetIOS, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from '@/components/styled';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Portal } from 'react-native-teleport';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTimeAgo, type FeedPost } from '@/hooks/use-feed';
import { blockUser, reportContent } from '@/lib/moderation';
import { openFriendCard } from '@/lib/friend-card';
import { openPostDetail, syncPostDetail, usePostDetail } from '@/lib/post-detail';
import { supabase } from '@/lib/supabase';
import { NEON, PURPLE } from '@/lib/theme';
import { FEED_MEDIA_ASPECT, PostMedia, isMuxVideoPost, postHasMedia } from './post-media';

export function GradientRingAvatar({ name, url }: { name: string; url: string | null }) {
  return (
    <View
      className="w-8 h-8 rounded-full items-center justify-center"
      style={{
        padding: 1.5,
        experimental_backgroundImage: 'linear-gradient(135deg, #a855f7, #d4ff00)',
      }}
    >
      <View className="w-full h-full rounded-full overflow-hidden border-[1.5px] border-[#110a24] bg-[#110a24] items-center justify-center">
        {url ? (
          <Image source={{ uri: url }} className="w-full h-full" contentFit="cover" />
        ) : (
          <Text className="text-white text-xs font-sans">{name?.[0] ?? '?'}</Text>
        )}
      </View>
    </View>
  );
}

interface PostCardProps {
  post: FeedPost;
  isLiked: boolean;
  currentUserId: string;
  onToggleLike: (postId: string) => void;
  onDelete: (postId: string) => void;
  /** Viewport visibility from the list — off-screen videos pause. */
  isVisible?: boolean;
}

export function PostCard({
  post,
  isLiked,
  currentUserId,
  onToggleLike,
  onDelete,
  isVisible = true,
}: PostCardProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isOwner = post.user_id === currentUserId;
  const hasMedia = postHasMedia(post);
  const isVideo = isMuxVideoPost(post) || post.media_type === 'video';

  // Post detail transition (POST-DETAIL-PLAN.md): when this card is the
  // one being viewed, its media is teleported into the detail screen's
  // host. The selector returns a primitive, so only the active row
  // re-renders on a transition.
  const mediaRef = useRef<View>(null);
  const hostName = usePostDetail((s) => (s.postId === post.id ? s.hostName : undefined));
  const isActive = usePostDetail((s) => s.postId === post.id);
  // Keep the detail's copy of this post fresh: the feed's optimistic like
  // updates land here first.
  useEffect(() => {
    if (isActive) syncPostDetail(post, isLiked);
  }, [isActive, post, isLiked]);

  /** Video tap → the reel (media teleported in); comment icon → the sheet over the feed. */
  const openDetail = (mode: 'reel' | 'sheet') => {
    const launch = (origin: { y: number; width: number; height: number } | null) =>
      openPostDetail({
        post,
        isLiked,
        mode,
        origin,
        toggleLike: onToggleLike,
        deletePost: onDelete,
      });
    const node = mediaRef.current;
    if (mode === 'sheet' || !hasMedia || !node) return launch(null);
    node.measureInWindow((_x, y, w, h) => launch(h > 0 ? { y, width: w, height: h } : null));
  };

  const openMenu = () => {
    if (isOwner) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Delete Post', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 },
        (index) => {
          if (index === 0) onDelete(post.id);
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
          if (index === 0) reportContent(currentUserId, { type: 'post', id: post.id });
          if (index === 1) blockUser(currentUserId, post.user_id, post.display_name);
        }
      );
    }
  };

  const openComments = () => openDetail('sheet');

  // Posts with a hand-typed venue store only the name — resolve it to a venue
  // row on tap (port of the web venue_id lookup fallback).
  const openVenue = async () => {
    let venueId = post.venue_id;
    if (!venueId && post.venue_name) {
      const { data } = await supabase
        .from('venues')
        .select('id')
        .ilike('name', post.venue_name)
        .limit(1)
        .maybeSingle();
      venueId = data?.id ?? null;
    }
    if (venueId) router.push({ pathname: '/venue', params: { venueId } });
  };

  const sharePost = () => {
    router.push({
      pathname: '/share-post',
      params: { postId: post.id, authorId: post.user_id, authorName: post.display_name },
    });
  };

  return (
    <View className="border-b border-white/[0.06]">
      {/* Header — name and venue flow in a WRAPPING row: both are shown in
          full, and the venue drops to its own line only when it doesn't fit
          beside the name. Truncating either one hid information people
          posted on purpose. */}
      <View className="flex-row items-center px-4 py-3">
        <Pressable
          onPress={() => openFriendCard(post.user_id, currentUserId)}
          hitSlop={4}
          className="active:opacity-70"
        >
          <GradientRingAvatar name={post.display_name} url={post.avatar_url} />
        </Pressable>
        <View className="flex-1 min-w-0 ml-2.5 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Pressable
            onPress={() => openFriendCard(post.user_id, currentUserId)}
            hitSlop={4}
            className="active:opacity-70"
          >
            <Text className="font-sans-semibold text-white text-sm">{post.display_name}</Text>
          </Pressable>
          {post.venue_name ? (
            <Pressable onPress={openVenue} hitSlop={4}>
              <Text className="text-[#d4ff00] text-xs font-sans-medium">@{post.venue_name}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text className="text-white/50 text-xs font-sans shrink-0 ml-2" numberOfLines={1}>
          {getTimeAgo(post.created_at)} · until 5am
        </Text>
        <Pressable onPress={openMenu} hitSlop={8} className="ml-3 opacity-60">
          <SymbolView name="ellipsis" size={18} tintColor="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>

      {/* Tagged friends — a pointer to people, never a change of audience
          (addendum v3 §9.3). Tapping a name opens their card. */}
      {post.tags.length > 0 ? (
        <View className="flex-row flex-wrap items-center px-4 pb-2 -mt-1">
          <SymbolView name="person.2.fill" size={11} tintColor="rgba(255,255,255,0.4)" />
          <Text className="text-white/45 text-xs font-sans ml-1.5">with </Text>
          {post.tags.map((t, i) => (
            <Text key={t.id}>
              <Text
                className="text-xs font-sans-medium"
                style={{ color: PURPLE }}
                onPress={() => openFriendCard(t.id, currentUserId)}
              >
                {t.display_name.split(' ')[0]}
              </Text>
              {i < post.tags.length - 1 ? (
                <Text className="text-white/45 text-xs font-sans">
                  {i === post.tags.length - 2 ? ' and ' : ', '}
                </Text>
              ) : null}
            </Text>
          ))}
        </View>
      ) : null}

      {/* Media — full bleed, 4:5. The outer Pressable is a FIXED-SIZE
          placeholder that keeps its slot while the media inside is
          teleported to the post detail (a Portal reserves no space). The
          Portal is always present: adding it only when active would remount
          the video and restart playback. Tapping a video opens the reel;
          photos do nothing here, as on Instagram (comments open the detail). */}
      {hasMedia ? (
        <Pressable
          ref={mediaRef}
          onPress={isVideo ? () => openDetail('reel') : undefined}
          accessibilityLabel={isVideo ? 'Open video' : undefined}
          style={{ width, height: width * FEED_MEDIA_ASPECT }}
          className="overflow-hidden bg-black"
        >
          {/* Explicit size on the Portal's own view too: with an auto-sized
              parent the 100% child would resolve to nothing. */}
          <Portal hostName={hostName} style={{ width: '100%', height: '100%' }}>
            <View style={{ width: '100%', height: '100%' }}>
              {/* Teleported to the reel while active: the mute button drops
                  below the status bar so it lines up with the back chevron. */}
              <PostMedia
                post={post}
                isVisible={isVisible}
                muteTop={isActive ? insets.top + 4 : 12}
              />
            </View>
          </Portal>
        </Pressable>
      ) : null}

      {/* Action row + like count + caption */}
      <View className="px-4 pt-2 pb-3">
        {!hasMedia && post.text ? (
          <Text className="text-white text-[15px] font-sans leading-snug mb-2">{post.text}</Text>
        ) : null}

        <View className="flex-row items-center">
          <Pressable onPress={() => onToggleLike(post.id)} hitSlop={8} className="active:scale-90">
            <SymbolView
              name={isLiked ? 'heart.fill' : 'heart'}
              size={24}
              tintColor={isLiked ? NEON : 'rgba(255,255,255,0.8)'}
            />
          </Pressable>
          <Pressable onPress={openComments} hitSlop={8} className="ml-4 opacity-80 active:scale-90">
            <SymbolView name="bubble.right" size={24} tintColor="rgba(255,255,255,0.8)" />
          </Pressable>
          <Pressable onPress={sharePost} hitSlop={8} className="ml-4 opacity-80 active:scale-90">
            <SymbolView name="paperplane" size={24} tintColor="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>

        {post.likes_count > 0 ? (
          <Pressable
            onPress={() => router.push({ pathname: '/post-likes', params: { postId: post.id } })}
            hitSlop={4}
          >
            <Text className="text-white text-[13px] font-sans-semibold mt-1.5">
              {post.likes_count} {post.likes_count === 1 ? 'like' : 'likes'}
            </Text>
          </Pressable>
        ) : null}

        {hasMedia && post.text ? (
          <Text className="text-white text-sm font-sans mt-1" numberOfLines={3}>
            <Text className="font-sans-semibold">{post.display_name}</Text> {post.text}
          </Text>
        ) : null}

        {post.comments_count > 0 ? (
          <Pressable onPress={openComments} hitSlop={4}>
            <Text className="text-white/55 text-sm font-sans mt-1">
              View all {post.comments_count} comments
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
