import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCountdown, useNightMode } from '@/hooks/use-night-mode';
import { NEON } from '@/lib/theme';

export function ModeCountdownStrip() {
  const mode = useNightMode();
  const countdown = useCountdown(mode.opensAt);
  if (mode.isNight) return null;
  return <Pressable onPress={() => router.push('/night-hours')} accessibilityRole="button"
    accessibilityLabel={`Night Mode in ${Number(countdown.hours)} hours ${Number(countdown.minutes)} minutes. 6 PM in your profile city.`}
    className="mx-4 py-3 min-h-11 flex-row flex-wrap items-center gap-2 border-t border-white/5">
    <SymbolView name="moon.stars" size={14} tintColor={NEON} />
    <Text className="text-white/65 text-xs font-sans flex-shrink">Tonight at 6 PM</Text>
    <View className="flex-1" />
    <Text className="text-[#d4ff00] text-xs font-sans-medium" style={{ fontVariant: ['tabular-nums'] }}>{countdown.hours}h {countdown.minutes}m</Text>
  </Pressable>;
}
