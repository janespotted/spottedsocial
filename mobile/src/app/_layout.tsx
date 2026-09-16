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
import { SCREEN_GRADIENT } from '@/lib/theme';
import { BackgroundLocationManager } from '@/components/background-location-manager';
import { NightStatusGate } from '@/components/night-status-gate';
import { PushNotificationManager } from '@/components/push-notification-manager';
import { queryClient } from '@/lib/query-client';

function RootNavigator() {
  const { session, loading, onboardingNeeded } = useSession();
  const contentStyle = useResolveClassNames('bg-background');
  const gradientStyle = useResolveClassNames(SCREEN_GRADIENT);

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
      {/* Everything below requires a session — the guard evicts any of
          these left open (thread, sheets, modals) the moment it drops,
          instead of stranding them above the auth screen */}
      <Stack.Protected guard={!!session}>
      {/* Chat threads: root-level pushes so they slide OVER the native tab
          bar (per-screen tab-bar hiding pops visibly with native tabs) */}
      <Stack.Screen name="thread" options={{ contentStyle: gradientStyle }} />
      <Stack.Screen name="yap-thread" options={{ contentStyle: gradientStyle }} />
      <Stack.Screen name="comments" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create-post" options={{ presentation: 'modal' }} />
      <Stack.Screen name="create-plan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit-plan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="post-likes" options={{ presentation: 'modal' }} />
      <Stack.Screen name="activity" options={{ presentation: 'modal' }} />
      <Stack.Screen name="search" options={{ presentation: 'modal' }} />
      <Stack.Screen name="venue" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="contacts-sync"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="share-post"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="invite-friends"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="edit-profile"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="check-in"
        options={({ route }) => {
          // Opening prompt (?gate=1): required answer — no grabber and no
          // swipe/tap-outside dismiss. gestureEnabled:false maps to iOS
          // modalInPresentation on a formSheet. "Update status" opens the
          // same sheet without the flag and stays dismissible.
          const gate = (route.params as { gate?: string } | undefined)?.gate === '1';
          return {
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: !gate,
            gestureEnabled: !gate,
            contentStyle: { backgroundColor: 'transparent' },
          };
        }}
      />
      <Stack.Screen
        name="audience"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="new-chat"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="friend-card"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
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
      </Stack.Protected>
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
                  <NightStatusGate />
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
