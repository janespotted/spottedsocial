import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { HeaderActions } from '@/components/header-actions';
import { useCountdown, useNightMode } from '@/hooks/use-night-mode';
import { useNotifications } from '@/hooks/use-notifications';
import { dayRaised, primaryControl, primaryControlText } from '@/lib/theme';

export type OpeningKind = 'map' | 'leaderboard' | 'newsfeed';

const COPY: Record<OpeningKind, { icon: SFSymbol; label: string; title: string; line: string }> = {
  map: {
    icon: 'map',
    label: 'LIVE MAP',
    title: 'See where the night goes.',
    line: 'Find friends out, shared spots, and venue heat when Night Mode starts.',
  },
  leaderboard: {
    icon: 'chart.bar.xaxis',
    label: 'LEADERBOARD',
    title: 'Where’s everyone going?',
    line: 'See which spots are picking up tonight when Night Mode starts.',
  },
  newsfeed: {
    icon: 'newspaper',
    label: 'NEWSFEED',
    title: 'Catch the night as it happens.',
    line: 'See tonight’s posts and activity from your people when Night Mode starts.',
  },
};

/**
 * A whole Day Mode tab (Map, Leaderboard): the tabs' static top bar — the
 * same wordmark + city pill + actions as Home and Leaderboard — over the
 * opening screen. Rendered INSTEAD of the live screen, so none of its
 * queries, realtime channels or location work start.
 */
export function DayTabScreen({ kind }: { kind: Exclude<OpeningKind, 'newsfeed'> }) {
  const { city } = useNightMode();
  const { unreadCount } = useNotifications();
  return (
    <View className="flex-1">
      <View className="pt-safe-offset-3 z-10" style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}>
        <View className="flex-row items-center justify-between px-4 h-10 mb-3">
          <View className="flex-row items-center gap-2 flex-1 min-w-0">
            <Text
              className="text-white font-sans-light"
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 20, letterSpacing: 20 * 0.28 }}
            >
              Spotted
            </Text>
            <View className="px-2.5 py-1 rounded-full bg-white/10">
              <Text className="text-white/70 text-xs font-sans-medium uppercase">{city}</Text>
            </View>
          </View>
          <HeaderActions unreadCount={unreadCount} />
        </View>
      </View>
      <NightOpeningScreen kind={kind} />
    </View>
  );
}

/** The small "☀ Day Mode" chip above the opening screens (screenshots 02, 08, 11). */
export function DayModeChip() {
  return (
    <View className={`self-start flex-row items-center gap-1.5 h-8 px-3 rounded-full ${dayRaised}`}>
      <SymbolView name="sun.max" size={13} tintColor="rgba(255,255,255,0.85)" />
      <Text className="text-white/85 text-xs font-sans-medium">Day Mode</Text>
    </View>
  );
}

/**
 * What Map, Leaderboard and the Newsfeed show before Night Mode opens
 * (client brief §4). Nothing live is mounted underneath — the screens render
 * this INSTEAD of their content, so no stale rankings or pins are fetched or
 * shown. Two ways out: make a plan, or message a friend.
 */
export function NightOpeningScreen({ kind, showChip = true }: { kind: OpeningKind; showChip?: boolean }) {
  const { opensAt, opensLabel } = useNightMode();
  const { hours, minutes } = useCountdown(opensAt);
  const copy = COPY[kind];
  return (
    <View className="flex-1 px-6 pt-4 pb-32">
      {showChip ? <DayModeChip /> : null}
      <View className="flex-1 items-center justify-center">
        <View className={`w-18 h-18 rounded-3xl items-center justify-center mb-6 ${dayRaised}`}>
          <SymbolView name={copy.icon} size={30} tintColor="#ded0ed" />
        </View>
        <Text className="text-white/70 text-[11px] font-sans-medium tracking-[2px]">{copy.label}</Text>
        <Text className="text-white text-[28px] leading-9 font-sans-semibold text-center mt-3" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text className="text-white/60 text-sm font-sans leading-5 text-center mt-3 max-w-80">{copy.line}</Text>

        <Text className="text-white text-[15px] font-sans-medium mt-8">Opens today at {opensLabel}</Text>
        <View
          className="flex-row items-start justify-center gap-5 mt-3"
          accessible
          accessibilityLabel={`${Number(hours)} hours ${Number(minutes)} minutes until Night Mode`}
        >
          <View className="items-center">
            <Text className="text-[#d4ff00] text-[52px] leading-[58px] font-sans-medium" style={{ fontVariant: ['tabular-nums'] }}>
              {hours}
            </Text>
            <Text className="text-white/60 text-xs font-sans mt-1">hours</Text>
          </View>
          <Text className="text-white/60 text-[38px] leading-[52px] font-sans">:</Text>
          <View className="items-center">
            <Text className="text-[#d4ff00] text-[52px] leading-[58px] font-sans-medium" style={{ fontVariant: ['tabular-nums'] }}>
              {minutes}
            </Text>
            <Text className="text-white/60 text-xs font-sans mt-1">minutes</Text>
          </View>
        </View>

        <Text className="text-white/60 text-sm font-sans mt-8">Make a plan while the night takes shape.</Text>
        <Pressable
          onPress={() => router.push('/create-plan')}
          accessibilityRole="button"
          className={`self-stretch min-h-12 rounded-full items-center justify-center mt-4 active:opacity-85 ${primaryControl}`}
        >
          <Text className={`text-[15px] font-sans-semibold ${primaryControlText}`}>Make a plan</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/new-chat')}
          accessibilityRole="button"
          hitSlop={6}
          className="min-h-11 justify-center mt-1 active:opacity-70"
        >
          <Text className="text-[#d4ff00] text-[15px] font-sans-medium">Message a friend</Text>
        </Pressable>
      </View>
    </View>
  );
}
