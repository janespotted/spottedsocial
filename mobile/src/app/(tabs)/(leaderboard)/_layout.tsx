import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { SCREEN_GRADIENT } from '@/lib/theme';

export default function LeaderboardLayout() {
  const contentStyle = useResolveClassNames(SCREEN_GRADIENT);
  return (
    <Stack
      screenOptions={{
        contentStyle,
        headerLargeTitle: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerLargeTitleStyle: { color: '#ffffff' },
        headerTitleStyle: { color: '#ffffff' },
      }}
    >
      <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
    </Stack>
  );
}
