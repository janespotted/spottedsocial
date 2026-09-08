import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { SCREEN_GRADIENT } from '@/lib/theme';

export default function LeaderboardLayout() {
  const contentStyle = useResolveClassNames(SCREEN_GRADIENT);
  return (
    <Stack screenOptions={{ contentStyle }}>
      {/* Custom static header inside the screen (web PageHeader parity) */}
      <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard', headerShown: false }} />
    </Stack>
  );
}
