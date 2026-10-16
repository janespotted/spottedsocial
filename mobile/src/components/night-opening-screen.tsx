import { useWindowDimensions } from 'react-native';
import { TabHeaderRow } from '@/components/tab-header-row';
import { ModeCountdownStrip } from './mode-countdown-strip';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { VenueDiscovery } from '@/components/venue-discovery';
import { useNightMode } from '@/hooks/use-night-mode';
import { useNotifications } from '@/hooks/use-notifications';
import { dayRaised, primaryControl, primaryControlText } from '@/lib/theme';

export type OpeningKind = 'map' | 'leaderboard' | 'newsfeed';

const ICONS: Record<OpeningKind, SFSymbol> = { map: 'map', leaderboard: 'chart.bar.xaxis', newsfeed: 'newspaper' };

/**
 * A whole Day Mode tab (Map, Leaderboard): the tabs' static top bar — the
 * same wordmark + city pill + actions as Home and Leaderboard — over the
 * venue catalog. Rendered INSTEAD of the live screen, so none of its
 * queries, realtime channels or location work start.
 */
export function DayTabScreen({ kind }: { kind: Exclude<OpeningKind, 'newsfeed'> }) {
  const { fontScale } = useWindowDimensions();
  const { city } = useNightMode();
  const { unreadCount } = useNotifications();
  return (
    <View key={fontScale} className="flex-1">
      <View className="pt-safe-offset-3 z-10" style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}>
        <TabHeaderRow city={city} unreadCount={unreadCount} />
      </View>
      <ModeCountdownStrip />
      <VenueDiscovery liveKind={kind} />
    </View>
  );
}

/** The small "☀ Day Mode" chip above the opening screens (screenshots 02, 08, 11). */
export function DayModeChip() {
  return (
    <View className={`self-start flex-row items-center gap-1.5 min-h-8 py-2 px-3 rounded-full ${dayRaised}`}>
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
  const { opensLabel } = useNightMode();
  return (
    <View className="flex-1 px-6 pt-4 pb-32">
      {showChip ? <DayModeChip /> : null}
      <View className="flex-1 items-center justify-center gap-3">
        <View className="w-14 h-14 rounded-2xl bg-white/[0.05] items-center justify-center mb-3">
          <SymbolView name={ICONS[kind]} size={25} tintColor="#ded0ed" />
        </View>
        <Text className="text-white text-2xl font-sans-semibold" accessibilityRole="header">Live tonight</Text>
        <Text className="text-white/60 text-sm font-sans">Opens at {opensLabel}.</Text>
        <Pressable onPress={() => router.push('/create-plan')} accessibilityRole="button" className={`min-h-12 px-7 rounded-full items-center justify-center mt-4 active:opacity-85 ${primaryControl}`}>
          <Text className={`text-sm font-sans-semibold ${primaryControlText}`}>Make a plan</Text>
        </Pressable>
      </View>
    </View>
  );
}
