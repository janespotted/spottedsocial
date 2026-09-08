import '../../global.css';
import {
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener, SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind, useResolveClassNames } from 'uniwind';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { BackgroundLocationManager } from '@/components/background-location-manager';
import { PushNotificationManager } from '@/components/push-notification-manager';
import { queryClient } from '@/lib/query-client';

function RootNavigator() {
  const { session, loading, onboardingNeeded } = useSession();
  const contentStyle = useResolveClassNames('bg-background');

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Protected guard={!!session && !onboardingNeeded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && onboardingNeeded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      <Stack.Screen name="terms" options={{ presentation: 'modal' }} />
      <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
      <Stack.Screen name="comments" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create-plan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit-plan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="post-likes" options={{ presentation: 'modal' }} />
      <Stack.Screen name="activity" options={{ presentation: 'modal' }} />
      <Stack.Screen name="search" options={{ presentation: 'modal' }} />
      <Stack.Screen name="venue" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="map-filters"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          // Transparent so the native sheet material (liquid glass on iOS 26)
          // shows instead of the app's solid contentStyle
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="business" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
          <KeyboardProvider>
            <HeroUINativeProvider>
              <SessionProvider>
                <QueryClientProvider client={queryClient}>
                  <RootNavigator />
                  <BackgroundLocationManager />
                  <PushNotificationManager />
                  <StatusBar style="light" />
                </QueryClientProvider>
              </SessionProvider>
            </HeroUINativeProvider>
          </KeyboardProvider>
        </SafeAreaListener>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
