import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { PhoneVerifyForm } from '@/components/phone-verify-form';
import { showToast } from '@/lib/toast';
import { AUTH_ACCOUNT_KEY } from '@/hooks/use-auth-account';

/** Settings → Sign-in methods → Add / Change phone number. */
export default function AddPhoneScreen() {
  const queryClient = useQueryClient();
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: [AUTH_ACCOUNT_KEY] });
    router.back();
    showToast('Phone number saved');
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
        <Text className="text-white font-sans-semibold text-base flex-1">Phone number</Text>
      </View>
      {/* pb-32 clears the native tab bar + home indicator (see settings.tsx) */}
      <KeyboardAwareScrollView
        contentContainerClassName="px-4 pt-6 pb-32 gap-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bottomOffset={24}
      >
        <Text className="text-white/60 text-sm font-sans leading-5">
          Friends who have this number in their contacts can find you, and you can sign in with it. We&apos;ll text a
          code to confirm it.
        </Text>
        <PhoneVerifyForm onVerified={done} />
      </KeyboardAwareScrollView>
    </View>
  );
}
