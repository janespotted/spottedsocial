import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { SCREEN_GRADIENT } from '@/lib/theme';

export default function MapLayout() {
  const contentStyle = useResolveClassNames(SCREEN_GRADIENT);
  return (
    <Stack screenOptions={{ contentStyle }}>
      <Stack.Screen name="map" options={{ title: 'Map', headerShown: false }} />
    </Stack>
  );
}
