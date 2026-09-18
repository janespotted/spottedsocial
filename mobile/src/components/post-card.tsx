import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from '@/components/styled';
import { useEvent } from 'expo';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import { getTimeAgo, type FeedPost } from '@/hooks/use-feed';
import { blockUser, reportContent } from '@/lib/moderation';
import { openFriendCard } from '@/lib/friend-card';
import { muxHlsUrl, muxPlaybackState, muxThumbnailUrl } from '@/lib/mux';
import { supabase } from '@/lib/supabase';
import { NEON } from '@/lib/theme';

/**
 * Feed video. Mux posts stream HLS with the Mux poster frame underneath
 * until the player reports it is ready, so the tile is never black while
 * the manifest loads; legacy Storage videos play from their signed URL.
 */
function PostVideo({
  uri,
  poster,
  isVisible,
}: {
  uri: string;
  poster?: string | null;
  isVisible: boolean;
}) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const showPoster = !!poster && status !== 'readyToPlay';

  // Viewport-based pause: only the on-screen video plays (web parity —
  // saves battery and stops off-screen audio when unmuted)
  useEffect(() => {
    try {
      if (isVisible) player.play();
      else player.pause();
    } catch {
      /* player may be released during unmount */
    }
  }, [isVisible, player]);

  const toggleMute = () => {
    player.muted = !muted;
    setMuted(!muted);
  };

  return (
    <View className="w-full h-full bg-black">
      <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />
      {showPoster ? (
        <Image
          pointerEvents="none"
          source={{ uri: poster }}
          className="absolute inset-0"
          contentFit="cover"
          transition={0}
        />
      ) : null}
      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 items-center justify-center"
      >
        <SymbolView
          name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'}
          size={14}
          tintColor="#ffffff"
        />
      </Pressable>
    </View>
  );
}

/** Mux still encoding (a few seconds for a 14 s clip) or gave up. */
function VideoPending({ errored }: { errored: boolean }) {
  return (
    <View className="w-full h-full items-center justify-center gap-3 bg-[#0b0618]">
      {errored ? (
        <SymbolView name="video.slash" size={28} tintColor="rgba(255,255,255,0.45)" />
      ) : (
        <ActivityIndicator color={NEON} />
      )}
      <Text className="text-white/55 text-xs font-sans-medium">
        {errored ? "This video couldn't be processed" : 'Video is processing…'}
      </Text>
    </View>
  );
}

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
  const isOwner = post.user_id === currentUserId;
  // Mux video rows have no image_url; the playback id arrives via webhook
  const isMuxVideo = post.media_type === 'video' && !post.image_url && (post.mux_status != null || !!post.mux_playback_id);
  const muxState = muxPlaybackState(post.mux_status, post.mux_playback_id);
  const hasMedia = isMuxVideo || !!post.image_url;

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

  const openComments = () =>
    router.push({ pathname: '/comments', params: { postId: post.id } });

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
      {/* Header — compact single row */}
      <View className="flex-row items-center px-4 py-3">
        <View className="flex-row items-center gap-2.5 min-w-0 flex-1">
          <Pressable
            onPress={() => openFriendCard(post.user_id, currentUserId)}
            hitSlop={4}
            className="flex-row items-center gap-2.5 shrink active:opacity-70"
          >
            <GradientRingAvatar name={post.display_name} url={post.avatar_url} />
            <Text className="font-sans-semibold text-white text-sm" numberOfLines={1}>
              {post.display_name}
            </Text>
          </Pressable>
          {post.venue_name ? (
            <Pressable onPress={openVenue} hitSlop={4} className="shrink">
              <Text className="text-[#d4ff00] text-xs font-sans-medium" numberOfLines={1}>
                @{post.venue_name}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text className="text-white/50 text-xs font-sans">
          {getTimeAgo(post.created_at)} · until 5am
        </Text>
        <Pressable onPress={openMenu} hitSlop={8} className="ml-3 opacity-60">
          <SymbolView name="ellipsis" size={18} tintColor="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>

      {/* Media — full bleed, 4:5 */}
      {isMuxVideo ? (
        <View style={{ width, height: width * 1.25 }} className="overflow-hidden">
          {muxState === 'ready' && post.mux_playback_id ? (
            <PostVideo
              uri={muxHlsUrl(post.mux_playback_id)}
              poster={muxThumbnailUrl(post.mux_playback_id)}
              isVisible={isVisible}
            />
          ) : (
            <VideoPending errored={muxState === 'errored'} />
          )}
        </View>
      ) : post.image_url ? (
        <View style={{ width, height: width * 1.25 }} className="overflow-hidden">
          {post.media_type === 'video' ? (
            <PostVideo uri={post.image_url} isVisible={isVisible} />
          ) : (
            <Image
              // cacheKey: signed URLs change every mint, the path never does —
              // without it every feed refresh re-downloads every image.
              source={{ uri: post.image_url, cacheKey: post.media_path ?? undefined }}
              placeholder={post.media_hash ? { thumbhash: post.media_hash } : undefined}
              placeholderContentFit="cover"
              recyclingKey={post.id}
              className="w-full h-full"
              contentFit="cover"
              transition={150}
            />
          )}
        </View>
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
