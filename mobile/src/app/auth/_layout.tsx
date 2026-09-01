import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { SCREEN_GRADIENT } from '@/lib/theme';

export default function AuthLayout() {
  const contentStyle = useResolveClassNames(SCREEN_GRADIENT);
  const sheetStyle = useResolveClassNames('bg-surface');

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="otp"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5, 0.75],
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          contentStyle: sheetStyle,
        }}
      />
    </Stack>
  );
}
