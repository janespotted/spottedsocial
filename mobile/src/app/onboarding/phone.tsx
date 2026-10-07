import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ProgressDots } from '@/components/progress-dots';
import { PhoneVerifyForm } from '@/components/phone-verify-form';

/**
 * Optional: only accounts without a phone get here (Sign in with Apple —
 * Apple never shares one). Contact matching looks people up by their verified
 * number, so without it friends syncing contacts can't find them. It must
 * stay skippable: App Review rejects apps that require a phone number after
 * Sign in with Apple. Settings → Sign-in methods offers it again later.
 */
export default function OnboardingPhoneScreen() {
  const next = () => router.push('/onboarding/welcome');
  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-[#110a24]"
      contentContainerClassName="flex-grow px-6 pt-safe-offset-5 pb-safe-offset-6"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={24}
    >
      <ProgressDots current={5} total={5} />

      <View className="mt-12 mb-8">
        <Text className="text-[28px] font-sans-light text-white leading-tight">add your number?</Text>
        <Text className="text-sm text-white/55 font-sans mt-2">
          friends who have your number in their contacts can find you. we&apos;ll text a code to confirm it.
        </Text>
      </View>

      <PhoneVerifyForm onVerified={next} />

      <View className="mt-auto pt-10 items-center">
        <Pressable onPress={next} hitSlop={10} accessibilityRole="button" className="min-h-11 justify-center">
          <Text className="text-sm text-white/55 font-sans underline">skip for now</Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
}
