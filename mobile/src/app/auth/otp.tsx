import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { InputOTP } from 'heroui-native';
import { supabase } from '@/lib/supabase';
import { SpottedMark } from '@/components/spotted-mark';
import { formatE164 } from '@/lib/country-codes';
import { NEON } from '@/lib/theme';

const RESEND_COOLDOWN_S = 60;

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const { width } = useWindowDimensions();
  const slotWidth = Math.min(48, Math.floor((width - 48 - 40) / 6));
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verifyCode = async (token: string) => {
    if (!phone || pending.current || !/^\d{6}$/.test(token.trim())) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ phone, token: token.trim(), type: 'sms' });
      if (err) throw err;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setError(/expired|invalid|otp/i.test(message) ? 'That code didn’t work. Try again or request a new one.' : 'Couldn’t verify your code. Check your connection and try again.');
    } finally { pending.current = false; setBusy(false); }
  };
  const resend = async () => {
    if (!phone || cooldown > 0 || pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({ phone });
      if (err) throw err;
      setCooldown(RESEND_COOLDOWN_S);
    } catch { setError('Couldn’t resend your code. Wait a minute and try again.'); }
    finally { pending.current = false; setBusy(false); }
  };

  return (
    <View className="flex-1 bg-[#110a24]">
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow items-center px-6 pt-safe-offset-10"
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          accessibilityRole="button" accessibilityLabel="Change phone number" disabled={busy} onPress={() => router.canGoBack() ? router.back() : router.replace('/auth')}
          hitSlop={12}
          className="absolute left-4 top-safe-offset-10 p-2"
        >
          <SymbolView name="arrow.left" size={20} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>

        <View style={{ marginBottom: 16 }}>
          <SpottedMark size={48} />
        </View>
        <Text className="text-white text-2xl font-sans-light mb-2">enter your code</Text>
        <Text className="text-sm text-white/50 font-sans mb-8">
          we sent it to {phone ? formatE164(phone) : ''}
        </Text>

        <InputOTP
          maxLength={6}
          onComplete={verifyCode}
          onChange={setCode}
          textInputProps={{ autoFocus: true, textContentType: 'oneTimeCode', keyboardType: 'number-pad' }}
        >
          <InputOTP.Group className="gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTP.Slot
                key={i}
                index={i}
                style={{ width: slotWidth }}
                className="h-14 rounded-xl border border-white/15 bg-white/5"
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
          className="w-full min-h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-50 mt-6"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-black text-base font-sans-semibold">
            {busy ? 'verifying...' : 'verify'}
          </Text>
        </Pressable>

        <Pressable onPress={resend} disabled={busy || cooldown > 0} className="mt-4">
          <Text className="text-sm text-white/55 font-sans">
            {cooldown > 0 ? `didn't get it? resend in ${cooldown}s` : "didn't get it? resend"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
