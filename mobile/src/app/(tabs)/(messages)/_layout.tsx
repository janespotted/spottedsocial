import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { SCREEN_GRADIENT } from '@/lib/theme';

export default function MessagesLayout() {
  const contentStyle = useResolveClassNames(SCREEN_GRADIENT);
  return (
    <Stack screenOptions={{ contentStyle, headerShown: false }}>
      {/* Custom static headers inside the screens (web PageHeader parity).
          Thread screens live at the ROOT stack so they push over the tab
          bar (native tabs can't hide per-screen without a jarring toggle) */}
      <Stack.Screen name="messages" options={{ title: 'Chat' }} />
    </Stack>
  );
}
