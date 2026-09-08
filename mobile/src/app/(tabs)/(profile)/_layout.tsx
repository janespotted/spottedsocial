import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { SCREEN_GRADIENT } from '@/lib/theme';

export default function ProfileLayout() {
  const contentStyle = useResolveClassNames(SCREEN_GRADIENT);
  return (
    <Stack screenOptions={{ contentStyle, headerShown: false }}>
      {/* Custom static headers inside the screens (web PageHeader parity) */}
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="friends" options={{ title: 'Friends' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="blocked-hidden" options={{ title: 'Blocked & Hidden' }} />
    </Stack>
  );
}
