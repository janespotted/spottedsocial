import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { NEON } from '@/lib/theme';

/**
 * TBD users get told the moment friends head out (client feedback §8):
 * "3 friends are out now" with the one tap that joins them. Driven by
 * useFriendsOut, which already refreshes on every night_statuses change,
 * so the count updates live.
 */
export function FriendsOutBanner({ count, names }: { count: number; names: string[] }) {
  if (count === 0) return null;
  const first = names.slice(0, 2).map((n) => n.split(' ')[0]);
  const who =
    count === 1
      ? `${first[0]} is out now`
      : count === 2
        ? `${first[0]} and ${first[1]} are out now`
        : `${first[0]}, ${first[1]} and ${count - 2} more are out now`;
  return (
    <Pressable
      onPress={() => router.push('/check-in')}
      accessibilityRole="button"
      accessibilityLabel={`${who}. Update your status to join them`}
      className="flex-row items-center gap-3 rounded-2xl px-4 py-3 active:opacity-90"
      style={{ backgroundColor: 'rgba(212,255,0,0.10)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.35)' }}
    >
      <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(212,255,0,0.18)' }}>
        <SymbolView name="figure.walk.motion" size={18} tintColor={NEON} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-white text-sm font-sans-semibold" numberOfLines={1}>{who}</Text>
        <Text className="text-white/60 text-xs font-sans">You&apos;re TBD — heading out? Tap to update.</Text>
      </View>
      <SymbolView name="chevron.right" size={13} tintColor={NEON} />
    </Pressable>
  );
}
