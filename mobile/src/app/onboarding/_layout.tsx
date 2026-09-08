import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';

export default function OnboardingLayout() {
  const contentStyle = useResolveClassNames('bg-[#110a24]');

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="username" />
      <Stack.Screen name="welcome" />
    </Stack>
  );
}
