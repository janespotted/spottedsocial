import { Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/hooks/use-session';
import { LaunchSetup } from './onboarding';

export default function AdminOnboarding() {
  const { launch } = useSession();
  const insets = useSafeAreaInsets();
  if (!launch?.cityTester && !launch?.waveAdmin) return <Redirect href="/settings" />;
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/settings'); };
  return <View className="flex-1 bg-[#110a24]">
    <View style={{ paddingTop: Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0) + 4 }} className="px-5 pb-1 flex-row items-center justify-between border-b border-white/10">
      <View className="flex-1"><Text className="text-[#d4ff00] text-xs font-sans-semibold">ONBOARDING PREVIEW</Text><Text className="text-white/50 text-xs mt-1">After phone verification · nothing saved</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close onboarding preview" className="min-h-11 min-w-11 justify-center items-center" onPress={close}><Text className="text-white text-sm">Done</Text></Pressable>
    </View>
    <LaunchSetup preview onDone={close} />
  </View>;
}
