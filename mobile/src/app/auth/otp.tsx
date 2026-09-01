import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, InputOTP, LinkButton, Spinner } from 'heroui-native';
import { supabase } from '@/lib/supabase';

const RESEND_COOLDOWN_S = 30;

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verifyCode = async (token: string) => {
    if (!phone) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      phone,
      token: token.trim(),
      type: 'sms',
    });
    setBusy(false);
    if (err) setError(err.message);
    // On success the session gate in the root layout swaps to (tabs)
  };

  const resend = async () => {
    if (!phone || cooldown > 0) return;
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone });
    if (err) {
      setError(err.message);
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-6 pt-8 pb-6 gap-7"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1.5">
        <Text className="text-foreground text-2xl font-extrabold tracking-tight">
          Enter the code
        </Text>
        <Text className="text-muted text-base">Sent to {phone}</Text>
      </View>

      <View className="gap-5">
        <InputOTP
          maxLength={6}
          onComplete={verifyCode}
          textInputProps={{ autoFocus: true, textContentType: 'oneTimeCode' }}
        >
          <InputOTP.Group className="gap-2">
            {[0, 1, 2].map((i) => (
              <InputOTP.Slot
                key={i}
                index={i}
                className="h-14 w-12 rounded-xl border border-white/20 bg-surface-secondary"
              />
            ))}
          </InputOTP.Group>
          <InputOTP.Separator />
          <InputOTP.Group className="gap-2">
            {[3, 4, 5].map((i) => (
              <InputOTP.Slot
                key={i}
                index={i}
                className="h-14 w-12 rounded-xl border border-white/20 bg-surface-secondary"
              />
            ))}
          </InputOTP.Group>
        </InputOTP>

        {busy ? (
          <View className="flex-row items-center gap-2">
            <Spinner size="sm" color="#a78bfa" />
            <Text className="text-muted text-base">Verifying…</Text>
          </View>
        ) : null}

        <View className="flex-row justify-between items-center">
          <LinkButton onPress={() => router.back()}>
            <LinkButton.Label className="text-muted">Change number</LinkButton.Label>
          </LinkButton>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={cooldown > 0}
            onPress={resend}
          >
            <Button.Label className={cooldown > 0 ? 'text-muted-dark' : 'text-accent'}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </Button.Label>
          </Button>
        </View>
      </View>

      {error ? (
        <Text selectable className="text-danger text-base">
          {error}
        </Text>
      ) : null}
    </ScrollView>
  );
}
