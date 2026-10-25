import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useNightRecap } from '@/hooks/use-night-recap';
import { NEON } from '@/lib/theme';

export function CompactRecapEntry() {
  const recap = useNightRecap();
  if (recap.isPending) return <View accessibilityLabel="Loading private replay" className="mx-4 h-16 rounded-2xl bg-white/5" />;
  if (recap.isError) return <Pressable accessibilityRole="button" onPress={() => void recap.refetch()} className="mx-4 py-3 min-h-11"><Text className="text-white/60 text-xs font-sans">Private replay unavailable · Retry</Text></Pressable>;
  if (!recap.data) return null;
  return <Pressable onPress={() => router.push('/morning-after')} accessibilityRole="button" accessibilityLabel="About last night. Open your private replay"
    className="mx-4 px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/10 flex-row items-center gap-3 active:opacity-75">
    <SymbolView name="sunrise" size={22} tintColor={NEON} />
    <View className="flex-1 gap-1"><Text className="text-white text-sm font-sans-medium">About last night…</Text><Text className="text-white/55 text-xs font-sans">Your private replay</Text></View>
    <SymbolView name="chevron.right" size={12} tintColor={NEON} />
  </Pressable>;
}
