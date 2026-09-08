import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { InputOTP } from 'heroui-native';
import { supabase } from '@/lib/supabase';
import spottedLogo from '../../../assets/images/spotted-s-logo.png';

const NEON = '#d4ff00';
const RESEND_COOLDOWN_S = 30;

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verifyCode = async (token: string) => {
    if (!phone || busy) return;
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
    <View className="flex-1 bg-[#110a24]">
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow items-center px-6 pt-safe-offset-10"
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="absolute left-4 top-safe-offset-10 p-2"
        >
          <SymbolView name="arrow.left" size={20} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>

        <Image
          source={spottedLogo}
          style={{ width: 48, height: 48, marginBottom: 16 }}
          contentFit="contain"
        />
        <Text className="text-white text-2xl font-sans-light mb-2">enter your code</Text>
        <Text className="text-sm text-white/50 font-sans mb-8">we sent it to {phone}</Text>

        <InputOTP
          maxLength={6}
          onComplete={verifyCode}
          onChange={setCode}
          textInputProps={{ autoFocus: true, textContentType: 'oneTimeCode' }}
        >
          <InputOTP.Group className="gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTP.Slot
                key={i}
                index={i}
                className="w-12 h-14 rounded-xl border border-white/15 bg-white/5"
              />
            ))}
          </InputOTP.Group>
        </InputOTP>

        {error ? (
          <Text selectable className="text-sm text-red-400 text-center font-sans mt-4">
            {error}
          </Text>
        ) : null}

        <Pressable
          onPress={() => verifyCode(code)}
          disabled={busy || code.trim().length < 6}
          className="w-full h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-50 mt-6"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-black text-base font-sans-semibold">
            {busy ? 'verifying...' : 'verify'}
          </Text>
        </Pressable>

        <Pressable onPress={resend} disabled={busy || cooldown > 0} className="mt-4">
          <Text className="text-sm text-white/40 font-sans">
            {cooldown > 0 ? `didn't get it? resend in ${cooldown}s` : "didn't get it? resend"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
