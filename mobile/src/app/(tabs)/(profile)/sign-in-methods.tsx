import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { AUTH_ACCOUNT_KEY, useAuthAccount } from '@/hooks/use-auth-account';
import { connectApple, disconnectApple, isAppleSignInAvailable } from '@/lib/apple-sign-in';
import { formatE164 } from '@/lib/country-codes';
import { showToast } from '@/lib/toast';
import { NEON, PURPLE } from '@/lib/theme';

function MethodRow({
  icon,
  title,
  subtitle,
  action,
  onPress,
  busy,
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  action?: string;
  onPress?: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy}
      accessibilityRole={onPress ? 'button' : undefined}
      className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] active:bg-white/[0.06]"
    >
      <View className="w-9 h-9 rounded-full bg-[#a855f7]/15 items-center justify-center">
        <SymbolView name={icon} size={15} tintColor={PURPLE} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-white text-sm font-sans-medium">{title}</Text>
        <Text className="text-white/55 text-xs font-sans">{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={NEON} />
      ) : action ? (
        <Text className="text-[#d4ff00] text-sm font-sans-medium">{action}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Settings → Sign-in methods. The ways into THIS account: its phone number
 * (also what lets friends find you from their contacts) and Apple. Connecting
 * Apple here is what stops a phone user who later taps "Continue with Apple"
 * from ending up in a second, empty account.
 */
export default function SignInMethodsScreen() {
  const queryClient = useQueryClient();
  const { data: user, isLoading, refetch } = useAuthAccount();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  // pb-32 clears the native tab bar + home indicator (see settings.tsx)
  const contentContainerStyle = useResolveClassNames('px-4 pt-5 pb-32 gap-3');

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const phone = user?.phone ? formatE164(`+${user.phone.replace(/^\+/, '')}`) : null;
  const apple = user?.identities?.find((i) => i.provider === 'apple') ?? null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [AUTH_ACCOUNT_KEY] });
    await refetch();
  };

  const onConnect = async () => {
    setBusy(true);
    try {
      if (await connectApple()) {
        await refresh();
        showToast('Apple connected');
      }
    } catch (e) {
      Alert.alert('Couldn’t connect Apple', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = () => {
    if (!apple) return;
    if (!user?.phone) {
      Alert.alert('Add a phone number first', 'Apple is your only way to sign in. Add your number before disconnecting it.');
      return;
    }
    Alert.alert('Disconnect Apple?', `You'll sign in with ${phone} from now on.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await disconnectApple(apple);
            await refresh();
            showToast('Apple disconnected');
          } catch (e) {
            Alert.alert('Couldn’t disconnect Apple', e instanceof Error ? e.message : 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <View
        className="pt-safe-offset-3 pb-3 px-4 flex-row items-center gap-3 border-b border-white/10"
        style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Back" className="active:opacity-60">
          <SymbolView name="chevron.left" size={22} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
        <Text className="text-white font-sans-semibold text-base flex-1">Sign-in methods</Text>
      </View>

      <ScrollView contentContainerStyle={contentContainerStyle}>
        {isLoading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color={NEON} />
          </View>
        ) : (
          <>
            <MethodRow
              icon="phone"
              title="Phone number"
              subtitle={phone ?? 'Not added — friends can’t find you from their contacts'}
              action={phone ? 'Change' : 'Add'}
              onPress={() => router.push('/add-phone')}
            />
            {appleAvailable || apple ? (
              <MethodRow
                icon="apple.logo"
                title="Apple"
                subtitle={apple ? 'Connected' : 'Sign in with your Apple ID too'}
                action={apple ? 'Disconnect' : 'Connect'}
                onPress={apple ? onDisconnect : onConnect}
                busy={busy}
              />
            ) : null}
            <Text className="text-white/55 text-xs font-sans leading-5 px-1 mt-2">
              Every method here opens this same account. Signing in a different way that isn’t listed creates a
              separate, new account.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
