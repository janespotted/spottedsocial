import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Image } from '@/components/styled';
import { useEvent } from 'expo';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { FeedPost } from '@/lib/posts';
import { muxHlsUrl, muxPlaybackState, muxThumbnailUrl } from '@/lib/mux';
import { NEON } from '@/lib/theme';

/** Feed media is full-bleed 4:5: height = width × this. */
export const FEED_MEDIA_ASPECT = 1.25;

/** Mux video rows have no image_url; the playback id arrives via webhook. */
export function isMuxVideoPost(post: FeedPost): boolean {
  return (
    post.media_type === 'video' &&
    !post.image_url &&
    (post.mux_status != null || !!post.mux_playback_id)
  );
}

export function postHasMedia(post: FeedPost): boolean {
  return isMuxVideoPost(post) || !!post.image_url;
}

/**
 * Feed video. Mux posts stream HLS with the Mux poster frame underneath
 * until the player reports it is ready, so the tile is never black while
 * the manifest loads; legacy Storage videos play from their signed URL.
 */
function PostVideo({
  uri,
  poster,
  isVisible,
  muteTop,
}: {
  uri: string;
  poster?: string | null;
  isVisible: boolean;
  muteTop: number;
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
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        nativeControls={false}
      />
      {showPoster ? (
        <Image
          pointerEvents="none"
          source={{ uri: poster }}
          className="absolute inset-0"
          contentFit="cover"
          transition={0}
        />
      ) : null}
      {/* Top-right, mirroring the reel's back chevron (top bar, 40pt circle,
          12pt from the edge) so the two line up when this media is the reel.
          In the feed card it sits in the same corner of the 4:5 tile. */}
      <Pressable
        onPress={toggleMute}
        hitSlop={12}
        accessibilityLabel={muted ? 'Unmute' : 'Mute'}
        className="absolute right-3 w-10 h-10 rounded-full bg-black/40 items-center justify-center active:opacity-70"
        style={{ top: muteTop }}
      >
        <SymbolView
          name={muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'}
          size={16}
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

/**
 * A post's media, filling whatever contains it. Deliberately size-agnostic:
 * in the feed card it fills a fixed 4:5 placeholder; on the post detail it
 * fills a host that grows to the whole window — and it is the SAME native
 * view in both places (re-parented by react-native-teleport), so its style
 * must not depend on where it lives (POST-DETAIL-PLAN.md §3.3).
 */
export function PostMedia({
  post,
  isVisible = true,
  muteTop = 12,
}: {
  post: FeedPost;
  isVisible?: boolean;
  /**
   * Distance from the media's top edge to the mute button. The reel passes
   * the safe-area inset so the button lines up with the back chevron; the
   * feed card leaves the default.
   */
  muteTop?: number;
}) {
  if (isMuxVideoPost(post)) {
    const muxState = muxPlaybackState(post.mux_status, post.mux_playback_id);
    return muxState === 'ready' && post.mux_playback_id ? (
      <PostVideo
        uri={muxHlsUrl(post.mux_playback_id)}
        poster={muxThumbnailUrl(post.mux_playback_id)}
        isVisible={isVisible}
        muteTop={muteTop}
      />
    ) : (
      <VideoPending errored={muxState === 'errored'} />
    );
  }
  if (!post.image_url) return null;
  if (post.media_type === 'video')
    return <PostVideo uri={post.image_url} isVisible={isVisible} muteTop={muteTop} />;
  return (
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
  );
}
