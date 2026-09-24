import { AccountScope } from '@/components/account-scope';
import '../../global.css';
import { useEffect } from 'react';
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
import { PortalProvider } from 'react-native-teleport';
import { Uniwind, useResolveClassNames } from 'uniwind';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { INK_LIGHT, SCREEN_GRADIENT } from '@/lib/theme';
import * as SplashScreen from 'expo-splash-screen';
import { BackgroundLocationManager } from '@/components/background-location-manager';
import { NightStatusGate } from '@/components/night-status-gate';
import { PushNotificationManager } from '@/components/push-notification-manager';
import { ToastHost } from '@/components/toast-host';
import { hydrateDemoMode } from '@/lib/demo-mode';
import { queryClient } from '@/lib/query-client';

// Native splash only: the lime S on midnight stays up until fonts and the
// session are known, then fades out over the real first screen.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Demo mode is a saved per-device preference (off by default) — read it
// before anything queries, so a demo session survives a restart.
void hydrateDemoMode();
SplashScreen.setOptions({ fade: true, duration: 500 });

/** Hides the native splash once there is a real screen to reveal. */
function SplashController() {
  const { loading } = useSession();
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  return null;
}

/**
 * Every form sheet is opaque (client feedback §9). They used to be
 * transparent to show the native sheet material, but with no background
 * of their own the neon glows behind them bled through the card.
 */
const SHEET_CONTENT_STYLE = { backgroundColor: INK_LIGHT } as const;

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
      {/* Camera-first composer: full screen, no swipe-dismiss (the sheet
          guards populated drafts itself) */}
      <Stack.Screen
        name="create-post"
        options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
      />
      {/* "Invites Sent!" / Meet Up confirmation card: a transparent modal
          with no native animation — the screen fades itself in and out
          (addendum v3 §1) */}
      <Stack.Screen
        name="sent-confirmation"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          gestureEnabled: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      {/* Post detail (reel): a transparent modal with no native animation.
          The tapped card's media is teleported in and flown to full screen
          by the screen itself; the feed stays visible underneath while it
          does (POST-DETAIL-PLAN.md §3). */}
      <Stack.Screen
        name="post-detail"
        options={{
          presentation: 'transparentModal',
          animation: 'none',
          gestureEnabled: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="create-plan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="edit-plan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="post-likes" options={{ presentation: 'modal' }} />
      <Stack.Screen name="activity" options={{ presentation: 'modal' }} />
      <Stack.Screen name="search" options={{ presentation: 'modal' }} />
      {/* Venue card: sheet sized to its content (grows when More Info opens),
          like every other sheet here — a full modal read as a blank panel.
          Fixed detents left flex-1 content with no height to fill. The
          sheet's own background matches the card so the safe-area strip
          under the content doesn't show as a lighter band. */}
      <Stack.Screen
        name="venue"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: '#0d0a18' },
        }}
      />
      <Stack.Screen
        name="contacts-sync"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
      <Stack.Screen
        name="share-post"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
      <Stack.Screen
        name="invite-friends"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
      <Stack.Screen
        name="edit-profile"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
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
            contentStyle: SHEET_CONTENT_STYLE,
          };
        }}
      />
      <Stack.Screen
        name="audience"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
      <Stack.Screen
        name="tag-friends"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
      <Stack.Screen
        name="new-chat"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
      <Stack.Screen
        name="friend-card"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
        }}
      />
      <Stack.Screen
        name="map-filters"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: 'fitToContents',
          sheetGrabberVisible: true,
          contentStyle: SHEET_CONTENT_STYLE,
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
                <AccountScope>
                  <QueryClientProvider client={queryClient}>
                    {/* react-native-teleport: a feed post's media is re-parented
                        into the post detail screen (POST-DETAIL-PLAN.md) */}
                    <PortalProvider>
                      <RootNavigator />
                    </PortalProvider>
                    <NightStatusGate />
                    <BackgroundLocationManager />
                    <PushNotificationManager />
                    <StatusBar style="light" />
                    <SplashController />
                    <ToastHost />
                  </QueryClientProvider>
                </AccountScope>
              </SessionProvider>
            </HeroUINativeProvider>
          </KeyboardProvider>
        </SafeAreaListener>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
