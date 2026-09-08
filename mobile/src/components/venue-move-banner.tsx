import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

/** Port of the web VenueMoveBanner — "Moved to a new spot?" with 10s auto-dismiss. */
export function VenueMoveBanner({
  venueName,
  onAccept,
  onDismiss,
}: {
  venueName: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 10000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      className="bg-[#2d1b4e]/90 rounded-xl px-3 py-2.5 flex-row items-center gap-2 border border-[#a855f7]/30"
    >
      <SymbolView name="mappin" size={14} tintColor="#d4ff00" />
      <Text className="text-white/70 text-xs font-sans shrink" numberOfLines={1}>
        Moved to a new spot?
      </Text>
      <Pressable
        onPress={onAccept}
        className="px-2.5 py-1 rounded-full active:opacity-90"
        style={{ backgroundColor: '#d4ff00' }}
      >
        <Text className="text-[#0a0118] text-xs font-sans-semibold" numberOfLines={1}>
          {venueName}
        </Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8} className="ml-auto">
        <SymbolView name="xmark" size={12} tintColor="rgba(255,255,255,0.3)" />
      </Pressable>
    </Animated.View>
  );
}

/** Port of the web smart prompt — "Looks like you're at X. Go live?" */
export function SmartArrivalPrompt({
  venueName,
  onAccept,
  onDismiss,
}: {
  venueName: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      className="bg-gradient-to-r from-[#d4ff00]/20 to-[#a855f7]/20 border border-[#d4ff00]/40 rounded-xl px-4 py-3 flex-row items-center gap-3"
    >
      <View className="flex-1 min-w-0">
        <Text className="text-white text-sm font-sans-medium" numberOfLines={2}>
          Looks like you&apos;re at <Text className="text-[#d4ff00]">{venueName}</Text>
        </Text>
        <Text className="text-white/50 text-xs font-sans">Go live?</Text>
      </View>
      <Pressable
        onPress={onAccept}
        className="px-3 py-1.5 rounded-full active:opacity-90"
        style={{ backgroundColor: '#d4ff00' }}
      >
        <Text className="text-[#0a0118] text-xs font-sans-semibold">Share Location</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <SymbolView name="xmark" size={14} tintColor="rgba(255,255,255,0.4)" />
      </Pressable>
    </Animated.View>
  );
}
