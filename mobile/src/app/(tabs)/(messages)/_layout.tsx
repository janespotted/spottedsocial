import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { SCREEN_GRADIENT } from '@/lib/theme';

export default function MessagesLayout() {
  const contentStyle = useResolveClassNames(SCREEN_GRADIENT);
  return (
    <Stack screenOptions={{ contentStyle, headerShown: false }}>
      {/* Custom static headers inside the screens (web PageHeader parity) */}
      <Stack.Screen name="messages" options={{ title: 'Chat' }} />
      <Stack.Screen name="thread" options={{ title: 'Conversation' }} />
    </Stack>
  );
}
