import { useId, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePrivateScreen } from '@/hooks/use-private-screen';
export function CaptureGuard({ name, enabled = true, children }: { name: string; enabled?: boolean; children: ReactNode }) {
  const instance = useId();
  const { ready, failed, retry } = usePrivateScreen(`${name}-${instance}`, enabled);
  // Keep child hook/state lifetime stable without exposing protected pixels.
  return <View className="flex-1"><View style={{ flex: 1, opacity: ready ? 1 : 0 }} pointerEvents={ready ? 'auto' : 'none'} accessibilityElementsHidden={!ready} importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}>{children}</View>
    {!ready ? <View className="absolute inset-0 bg-[#110a24] items-center justify-center px-6 gap-3"><Text accessibilityLiveRegion="polite" className="text-white/65 text-sm text-center">{failed ? 'Couldn’t secure this screen.' : 'Preparing your private screen…'}</Text>{failed ? <><Pressable onPress={retry} accessibilityRole="button" className="min-h-11 px-5 justify-center"><Text className="text-[#d4ff00]">Try again</Text></Pressable><Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/map')} accessibilityRole="button" className="min-h-11 px-5 justify-center"><Text className="text-white/65">Go back</Text></Pressable></> : null}</View> : null}
  </View>;
}
