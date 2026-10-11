import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSession } from '@/hooks/use-session';
import { dismissTip, FIRST_USE_TIPS, shouldShowTip, type FirstUseTipId } from '@/lib/first-use-tips';
import { INK_LIGHT, MIST, NEON } from '@/lib/theme';

/** One quiet line at the relevant feature; no overlay, tour or extra step. */
export function FirstUseTip({ id, className = '' }: { id: FirstUseTipId; className?: string }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const identity = `${userId}:${id}`;
  const [loaded, setLoaded] = useState<{ identity: string; visible: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    if (userId) void shouldShowTip(userId, id).then(visible => {
      if (active) setLoaded({ identity, visible });
    });
    return () => { active = false; };
  }, [userId, id, identity]);

  if (!userId || loaded?.identity !== identity || !loaded.visible) return null;
  return <View className={`flex-row items-center rounded-2xl border border-white/10 pl-3 pr-1 py-1 ${className}`} style={{ backgroundColor: INK_LIGHT }}>
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><SymbolView name="sparkles" size={16} tintColor={NEON} /></View>
    <Text className="flex-1 text-xs leading-5 font-sans px-3 py-2" style={{ color: MIST }}>{FIRST_USE_TIPS[id]}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${id === 'recap' ? 'Morning After' : id} tip`} onPress={() => {
      setLoaded({ identity, visible: false });
      void dismissTip(userId, id);
    }} className="min-h-11 min-w-11 items-center justify-center active:opacity-60">
      <SymbolView name="xmark" size={12} tintColor={MIST} />
    </Pressable>
  </View>;
}
