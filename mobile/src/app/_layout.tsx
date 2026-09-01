import '../../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaListener, SafeAreaProvider } from 'react-native-safe-area-context';
import { Uniwind, useResolveClassNames } from 'uniwind';
import { SessionProvider, useSession } from '@/hooks/use-session';
import { BackgroundLocationManager } from '@/components/background-location-manager';

const queryClient = new QueryClient();

function RootNavigator() {
  const { session, loading } = useSession();
  const contentStyle = useResolveClassNames('bg-background');

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
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
