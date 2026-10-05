import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image } from '@/components/styled';
import { useNightRecap, useRecapPhotoUrls } from '@/hooks/use-night-recap';
import { outlineControl } from '@/lib/theme';

/** One Morning After picture, large, with Previous / Next (screenshot 06). Only you. */
export default function RecapPhoto() {
  const { index: raw } = useLocalSearchParams<{ index?: string }>();
  const { data: recap } = useNightRecap();
  const urls = useRecapPhotoUrls(recap);
  const photos = recap?.photos ?? [];
  const [index, setIndex] = useState(() => Math.max(0, Number(raw) || 0));
  const photo = photos[Math.min(index, photos.length - 1)];
  const url = photo ? urls.data?.get(photo.storage_key) : undefined;
  const step = (by: number) => setIndex((i) => (i + by + photos.length) % photos.length);

  return (
    <View className="flex-1 bg-[#110a24] px-4 pt-safe-offset-2 pb-safe-offset-4">
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        accessibilityRole="button"
        className="flex-row items-center gap-2 self-start min-h-11 active:opacity-70"
      >
        <SymbolView name="arrow.left" size={14} tintColor="rgba(255,255,255,0.7)" />
        <Text className="text-white/70 text-sm font-sans">Morning After</Text>
      </Pressable>
      <Text className="text-white text-[28px] font-sans-semibold mt-2 mb-4" accessibilityRole="header">
        Your pictures
      </Text>

      <View className="w-full rounded-2xl overflow-hidden bg-white/[0.06] items-center justify-center" style={{ aspectRatio: 4 / 5 }}>
        {url ? (
          <Image
            source={{ uri: url }}
            placeholder={photo?.thumbhash ? { thumbhash: photo.thumbhash } : undefined}
            className="w-full h-full"
            contentFit="cover"
            accessibilityLabel={`Picture ${index + 1} of ${photos.length}`}
          />
        ) : (
          <SymbolView name="photo" size={30} tintColor="rgba(255,255,255,0.45)" />
        )}
      </View>
      <Text className="text-white/60 text-xs font-sans mt-3">
        Last night · Only you{photos.length > 1 ? ` · ${index + 1} of ${photos.length}` : ''}
      </Text>

      {photos.length > 1 ? (
        <View className="flex-row gap-2.5 mt-4">
          <Pressable
            onPress={() => step(-1)}
            accessibilityRole="button"
            className={`flex-1 min-h-12 rounded-full items-center justify-center ${outlineControl}`}
          >
            <Text className="text-white text-[15px] font-sans-medium">Previous</Text>
          </Pressable>
          <Pressable
            onPress={() => step(1)}
            accessibilityRole="button"
            className={`flex-1 min-h-12 rounded-full items-center justify-center ${outlineControl}`}
          >
            <Text className="text-white text-[15px] font-sans-medium">Next</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
