import { Stack } from 'expo-router/stack';
import { useResolveClassNames } from 'uniwind';
import { INK_LIGHT } from '@/lib/theme';

/** Form sheets are opaque here too (feedback §9) — see the root layout. */
const SHEET_CONTENT_STYLE = { backgroundColor: INK_LIGHT } as const;

export default function AuthLayout() {
  const contentStyle = useResolveClassNames('bg-background');

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="otp" />
      <Stack.Screen
        name="country-code"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
    </Stack>
  );
}
