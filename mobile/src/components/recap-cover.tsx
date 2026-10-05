import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Avatar } from '@/components/avatar';
import { Image } from '@/components/styled';
import { useRecapPhotoUrls } from '@/hooks/use-night-recap';
import type { NightRecap, RecapPhoto } from '@/lib/night-recap';
import { NEON, POLAROID_EDGE, recapCover, STICKER_INK } from '@/lib/theme';

/** A Polaroid: thin edges, a thicker bottom, tilted. Shows a photo or an icon. */
export function Polaroid({
  width,
  rotate,
  photo,
  url,
  icon = 'photo',
  tint = 'rgba(255,255,255,0.75)',
  className = '',
}: {
  width: number;
  rotate: number;
  photo?: RecapPhoto;
  url?: string;
  icon?: 'photo' | 'sparkles';
  tint?: string;
  className?: string;
}) {
  return (
    <View
      className={`rounded-[5px] overflow-hidden bg-[#493254] items-center justify-center ${className}`}
      style={{
        width,
        aspectRatio: 4 / 5,
        borderColor: POLAROID_EDGE,
        borderWidth: 3,
        borderBottomWidth: Math.round(width * 0.17),
        transform: [{ rotate: `${rotate}deg` }],
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          placeholder={photo?.thumbhash ? { thumbhash: photo.thumbhash } : undefined}
          className="w-full h-full"
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <SymbolView name={icon} size={Math.round(width * 0.36)} tintColor={tint} />
      )}
    </View>
  );
}

/**
 * Home's Morning After card (client brief §3, screenshot 01): a little
 * scrapbook — "LAST NIGHT" sticker, two layered photo frames (the front one
 * is the user's first photo of the night), the friends from the night, and
 * "Replay the night". With no recap the card says so plainly; it never shows
 * sample content.
 */
export function RecapCover({ recap, loading }: { recap: NightRecap | null | undefined; loading: boolean }) {
  const photoUrls = useRecapPhotoUrls(recap);
  if (loading) return <View className="h-52 rounded-[22px] bg-white/[0.06]" />;

  if (!recap) {
    return (
      <View className="flex-row items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
        <SymbolView name="sunrise" size={20} tintColor="rgba(255,255,255,0.6)" />
        <Text className="flex-1 text-white/60 text-sm font-sans leading-5">
          Your Morning After shows up here after a night out.
        </Text>
      </View>
    );
  }

  const first = recap.photos[0];
  const firstUrl = first ? photoUrls.data?.get(first.storage_key) : undefined;
  const faces = recap.people.slice(0, 3);
  const stops = recap.stops.length;
  const label = [
    stops ? `${stops} ${stops === 1 ? 'stop' : 'stops'}` : null,
    recap.photos.length ? `${recap.photos.length} ${recap.photos.length === 1 ? 'picture' : 'pictures'}` : null,
    recap.people.length ? `${recap.people.length} familiar ${recap.people.length === 1 ? 'face' : 'faces'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => router.push('/morning-after')}
      accessibilityRole="button"
      accessibilityLabel={`About last night. ${label}. Replay the night`}
      className={`rounded-[22px] p-4 overflow-hidden active:opacity-90 ${recapCover}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-white/85 text-xs font-sans-medium">Morning After</Text>
        <View className="rounded px-2 py-1" style={{ backgroundColor: NEON, transform: [{ rotate: '5deg' }] }}>
          <Text className="text-[11px] font-sans-semibold" style={{ color: STICKER_INK }}>
            LAST NIGHT
          </Text>
        </View>
      </View>

      <View className="flex-row items-center justify-between pt-4 pb-5">
        <Text
          className="flex-1 text-white text-[30px] leading-[32px] font-sans-semibold"
          style={{ letterSpacing: -1 }}
          maxFontSizeMultiplier={1.3}
        >
          {'About\nlast night…'}
        </Text>
        <View className="w-24 h-28 mr-1" style={{ transform: [{ rotate: '3deg' }] }}>
          <Polaroid width={60} rotate={-10} className="absolute left-0 top-0 bg-[#705181]" />
          <Polaroid
            width={60}
            rotate={9}
            photo={first}
            url={firstUrl}
            icon="sparkles"
            tint="#D5F677"
            className="absolute right-0 bottom-0"
          />
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row">
          {faces.map((p, i) => (
            <View key={p.friend_id} className={`rounded-full border-2 border-[#3d2752] ${i > 0 ? '-ml-2' : ''}`}>
              <Avatar name={p.display_name} url={p.avatar_url} size="sm" />
            </View>
          ))}
        </View>
        <View className="flex-row items-center gap-1.5">
          <SymbolView name="play.fill" size={12} tintColor="#E0F5A5" />
          <Text className="text-[#E0F5A5] text-sm font-sans-medium">Replay the night</Text>
        </View>
      </View>
    </Pressable>
  );
}
