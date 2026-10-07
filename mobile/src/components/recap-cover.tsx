import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Camera, MapPinned, Sunrise } from 'lucide-react-native';
import Transition from 'react-native-screen-transitions';
import { Avatar } from '@/components/avatar';
import { DayPlaceholder } from '@/components/day-placeholder';
import { Image } from '@/components/styled';
import { useRecapPictures } from '@/hooks/use-night-recap';
import type { NightRecap } from '@/lib/night-recap';
import { NEON, POLAROID_EDGE, recapCover, STICKER_INK } from '@/lib/theme';

/** A Polaroid: thin edges, a thicker bottom, tilted. Shows a photo or an icon. */
export function Polaroid({
  width,
  rotate,
  thumbhash,
  url,
  icon = 'photo',
  tint = 'rgba(255,255,255,0.75)',
  className = '',
  boundTarget = false,
  video = false,
}: {
  width: number;
  rotate: number;
  thumbhash?: string | null;
  url?: string;
  icon?: 'photo' | 'sparkles' | 'photo.badge.plus';
  tint?: string;
  className?: string;
  /**
   * Marks the picture (inside the frame's border) as the measured target of
   * the caller's `Transition.Boundary`, so the photo zooms from exactly the
   * picture, not the whole Polaroid.
   */
  boundTarget?: boolean;
  /** A video post's poster: marked with a small play badge. */
  video?: boolean;
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
      {url && boundTarget ? (
        // Only inside the Morning After stack (app/(recap)) — a boundary needs
        // the screen-transitions navigator around it; Home's card has none.
        <Transition.Boundary.Target style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
          <Image
            source={{ uri: url }}
            placeholder={thumbhash ? { thumbhash } : undefined}
            className="w-full h-full"
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        </Transition.Boundary.Target>
      ) : url ? (
        <Image
          source={{ uri: url }}
          placeholder={thumbhash ? { thumbhash } : undefined}
          className="w-full h-full"
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <SymbolView name={icon} size={Math.round(width * 0.36)} tintColor={tint} />
      )}
      {url && video ? (
        <View
          pointerEvents="none"
          className="absolute items-center justify-center rounded-full bg-black/45"
          style={{ width: width * 0.3, height: width * 0.3 }}
        >
          <SymbolView name="play.fill" size={Math.round(width * 0.13)} tintColor="#ffffff" />
        </View>
      ) : null}
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
  const { pictures } = useRecapPictures(recap);
  if (loading) return <View className="h-52 rounded-[22px] bg-white/[0.06]" />;

  if (!recap) {
    return (
      <DayPlaceholder
        icons={[Sunrise, MapPinned, Camera]}
        title="Your Morning After lands here"
        body="Check in somewhere tonight — tomorrow you’ll get a replay of your stops, pictures and familiar faces."
      />
    );
  }

  // Saved pictures first, then camera-roll ones (once library access exists)
  const first = pictures[0];
  const faces = recap.people.slice(0, 3);
  const stops = recap.stops.length;
  const label = [
    stops ? `${stops} ${stops === 1 ? 'stop' : 'stops'}` : null,
    pictures.length ? `${pictures.length} ${pictures.length === 1 ? 'picture' : 'pictures'}` : null,
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
            thumbhash={first?.thumbhash}
            url={first?.url}
            video={first?.video}
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
