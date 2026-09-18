import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { dismissToast, subscribeToast, type ToastItem } from '@/lib/toast';
import { INK_LIGHT, NEON } from '@/lib/theme';

/**
 * Bottom toast with an optional action, above the tab bar. Mounted once in
 * the root layout; driven by lib/toast.ts showToast(). Used for the friend
 * card's "Removed X · Undo" and the invite / meet-up "sent" confirmations
 * (addendum v3 §1, §3).
 */
export function ToastHost() {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const actedRef = useRef(false);

  useEffect(() => subscribeToast(setToast), []);

  useEffect(() => {
    if (!toast) return;
    actedRef.current = false;
    const timer = setTimeout(() => {
      if (!actedRef.current) toast.onExpire?.();
      dismissToast(toast.id);
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 bottom-safe-offset-24 items-center px-4">
      <Animated.View
        key={toast.id}
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-3 pl-4 pr-2 py-2 rounded-full border border-white/15 max-w-full"
        style={{
          backgroundColor: INK_LIGHT,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <Text className="text-white text-sm font-sans-medium flex-shrink" numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            onPress={() => {
              actedRef.current = true;
              const { onPress } = toast.action!;
              dismissToast(toast.id);
              void onPress();
            }}
            accessibilityRole="button"
            className="px-3 min-h-9 justify-center rounded-full active:opacity-70"
          >
            <Text className="text-sm font-sans-semibold" style={{ color: NEON }}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : (
          <View className="w-2" />
        )}
      </Animated.View>
    </View>
  );
}
