import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image } from '@/components/styled';
import { GradientRingAvatar } from '@/components/post-card';
import { audienceLabel } from '@/lib/audience';
import { getCityLabel } from '@/lib/city-neighborhoods';
import { supabase } from '@/lib/supabase';
import { getActiveCity } from '@/lib/tonight';
import type { PublishedPost } from '@/lib/publish-post';
import { useSession } from '@/hooks/use-session';

const NEON = '#d4ff00';
const INK = '#110a24';
const GLASS_BG = 'rgba(255,255,255,0.05)';
const GLASS_BORDER = 'rgba(255,255,255,0.12)';

function SuccessMark() {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const halo = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 180 });
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
    halo.value = withDelay(120, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [scale, opacity, halo]);
  const mark = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const ring = useAnimatedStyle(() => ({
    opacity: 1 - halo.value,
    transform: [{ scale: 1 + halo.value * 0.9 }],
  }));
  return (
    <View className="w-20 h-20 items-center justify-center">
      <Animated.View
        style={[
          { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: NEON },
          ring,
        ]}
      />
      <Animated.View
        className="w-18 h-18 rounded-full items-center justify-center"
        style={[{ backgroundColor: NEON, boxShadow: '0 10px 30px rgba(212,255,0,0.35)' }, mark]}
      >
        <SymbolView name="checkmark" size={30} weight="bold" tintColor={INK} />
      </Animated.View>
    </View>
  );
}

function MediaPreview({ uri, type }: { uri: string; type: 'image' | 'video' }) {
  const player = useVideoPlayer(type === 'video' ? uri : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  if (type === 'video') {
    return (
      <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />
    );
  }
  return <Image source={{ uri }} className="w-full h-full" contentFit="cover" />;
}

/**
 * Success state after Share (client feedback §5): the post as friends will
 * see it, with the audience and expiry spelled out, then "View in feed" or
 * "Done". Media comes from the local capture, so nothing loads.
 */
export function PostShared({
  post,
  onViewFeed,
  onDone,
}: {
  post: PublishedPost;
  onViewFeed: () => void;
  onDone: () => void;
}) {
  const { session } = useSession();
  const { width, height } = useWindowDimensions();
  const [me, setMe] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  const cityLabel = getCityLabel(getActiveCity() ?? 'nyc');

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setMe({ display_name: data.display_name ?? 'You', avatar_url: data.avatar_url });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  const cardWidth = width - 40;
  // Budget the media so headline + card + buttons fit a 4.7"–6.9" screen;
  // the scroll view below is the safety net, never the plan.
  const mediaHeight = Math.max(200, Math.min(cardWidth * 0.9, height * 0.34));
  const name = me?.display_name ?? 'You';

  return (
    <View className="flex-1 bg-linear-to-b from-[#34215c] via-[#1d1240] to-[#110a24]">
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow justify-center px-5 pt-safe-offset-6 pb-4"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Headline */}
        <Animated.View entering={FadeInDown.duration(320)} className="items-center gap-2.5 mb-5">
          <SuccessMark />
          <Text className="text-white text-[26px] font-sans-bold tracking-tight">Posted</Text>
          <Text className="text-white/55 text-sm font-sans text-center leading-5">
            Visible to {audienceLabel(post.visibility)} until 5:00 AM {cityLabel}.
            {post.media?.type === 'video' ? ' Your video is processing and will play in the feed in a moment.' : ''}
          </Text>
        </Animated.View>

        {/* The post, as it appears in the feed */}
        <Animated.View entering={FadeInDown.delay(120).duration(360)}>
          <View
            className="rounded-3xl overflow-hidden"
            style={{
              backgroundColor: GLASS_BG,
              borderWidth: 1,
              borderColor: GLASS_BORDER,
              boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
            }}
          >
            <View className="flex-row items-center gap-2.5 px-4 py-3">
              <GradientRingAvatar name={name} url={me?.avatar_url ?? null} />
              <View className="flex-1 min-w-0 flex-row items-center gap-2">
                <Text className="text-white text-sm font-sans-semibold" numberOfLines={1}>
                  {name}
                </Text>
                {post.venue_name ? (
                  <Text className="text-[#d4ff00] text-xs font-sans-medium shrink" numberOfLines={1}>
                    @{post.venue_name}
                  </Text>
                ) : null}
              </View>
              <Text className="text-white/35 text-xs font-sans">now</Text>
            </View>

            {post.media ? (
              <View style={{ height: mediaHeight }} className="bg-black">
                <MediaPreview uri={post.media.uri} type={post.media.type} />
              </View>
            ) : null}

            <View className="px-4 pt-3 pb-4 gap-2">
              {post.text ? (
                <Text className="text-white text-sm font-sans leading-5" numberOfLines={post.media ? 3 : 8}>
                  {post.media ? <Text className="font-sans-semibold">{name} </Text> : null}
                  {post.text}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-1.5">
                <SymbolView name="eye" size={12} tintColor="rgba(255,255,255,0.45)" />
                <Text className="text-white/45 text-[11px] font-sans">
                  {audienceLabel(post.visibility)} · gone at 5:00 AM
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Actions — pinned below the scrolling content so they never overlap the card */}
      <View className="px-5 pt-3 pb-safe-offset-4">
        <Animated.View entering={FadeInDown.delay(220).duration(360)} className="gap-2.5">
          <Pressable
            onPress={onViewFeed}
            accessibilityLabel="View in feed"
            className="h-13 rounded-full items-center justify-center active:opacity-90"
            style={{ backgroundColor: NEON, boxShadow: '0 8px 24px rgba(212,255,0,0.3)' }}
          >
            <Text className="text-[#110a24] text-base font-sans-semibold">View in feed</Text>
          </Pressable>
          <Pressable
            onPress={onDone}
            accessibilityLabel="Done"
            className="h-13 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER }}
          >
            <Text className="text-white text-base font-sans-semibold">Done</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
