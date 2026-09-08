import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';

export default function AuthLayout() {
  const contentStyle = useResolveClassNames('bg-background');

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="otp" />
    </Stack>
  );
}
