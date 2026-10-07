import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { InputOTP } from 'heroui-native';
import {
  DEFAULT_COUNTRY,
  flagFor,
  formatE164,
  formatNational,
  openCountryPicker,
  placeholderFor,
  stripTrunkPrefix,
  SUPPORTED_LABEL,
  toE164,
  validateNational,
  type Country,
} from '@/lib/country-codes';
import { confirmPhoneCode, PhoneTakenError, sendPhoneCode } from '@/lib/phone-link';
import { NEON } from '@/lib/theme';

const RESEND_COOLDOWN_S = 30;

/**
 * Add or change the signed-in account's phone number: the number (with the
 * same country picker and formatting as the login screen), then the texted
 * code. Used by onboarding's optional phone step and Settings → Sign-in
 * methods. `onVerified` runs once the number is on the account.
 */
export function PhoneVerifyForm({ onVerified }: { onVerified: (e164: string) => void }) {
  const [stage, setStage] = useState<'number' | 'code'>('number');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [digits, setDigits] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const problem = useMemo(() => validateNational(digits, country), [digits, country]);
  const e164 = toE164(digits, country);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onChangeDigits = (text: string) => {
    let next = text.replace(/\D/g, '');
    const prefix = country.dial.slice(1);
    if (text.trim().startsWith('+') && next.startsWith(prefix)) next = next.slice(prefix.length);
    next = stripTrunkPrefix(next, country);
    // Backspacing a separator deletes the digit before it (see auth/index.tsx)
    if (next === digits && text.length < formatNational(digits, country).length) next = next.slice(0, -1);
    setDigits(next.slice(0, country.nsnLength ?? 15));
    setError(null);
  };

  const pickCountry = () => {
    setError(null);
    openCountryPicker({
      selected: country.code,
      onSelect: (next) => {
        setCountry(next);
        setDigits((d) => stripTrunkPrefix(d, next).slice(0, next.nsnLength ?? 15));
      },
    });
  };

  const send = async () => {
    setTouched(true);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendPhoneCode(e164);
      setStage('code');
      setCode('');
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setError(e instanceof PhoneTakenError ? e.message : e instanceof Error ? e.message.toLowerCase() : 'could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (token: string) => {
    if (busy || token.trim().length < 6) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPhoneCode(e164, token);
      onVerified(e164);
    } catch (e) {
      setError(e instanceof Error ? e.message.toLowerCase() : 'that code didn’t work');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setError(null);
    try {
      await sendPhoneCode(e164);
      setCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      setError(e instanceof Error ? e.message.toLowerCase() : 'could not resend the code');
    }
  };

  const invalid = touched && !!problem && digits.length > 0;

  if (stage === 'code') {
    return (
      <View className="gap-5">
        <Text className="text-sm text-white/55 font-sans">we sent a code to {formatE164(e164)}</Text>
        <InputOTP
          maxLength={6}
          onComplete={verify}
          onChange={setCode}
          textInputProps={{ autoFocus: true, textContentType: 'oneTimeCode' }}
        >
          <InputOTP.Group className="gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTP.Slot key={i} index={i} className="w-12 h-14 rounded-xl border border-white/15 bg-white/5" />
            ))}
          </InputOTP.Group>
        </InputOTP>
        {error ? (
          <Text selectable className="text-sm text-red-400 font-sans">
            {error}
          </Text>
        ) : null}
        <Pressable
          onPress={() => verify(code)}
          disabled={busy || code.trim().length < 6}
          className="w-full min-h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-black text-base font-sans-semibold">{busy ? 'verifying...' : 'verify'}</Text>
        </Pressable>
        <View className="flex-row justify-between">
          <Pressable onPress={() => setStage('number')} disabled={busy} hitSlop={8}>
            <Text className="text-sm text-white/55 font-sans">change number</Text>
          </Pressable>
          <Pressable onPress={resend} disabled={busy || cooldown > 0} hitSlop={8}>
            <Text className="text-sm text-white/55 font-sans">
              {cooldown > 0 ? `resend in ${cooldown}s` : 'resend code'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-5">
      <View className="gap-2">
        <View className="flex-row gap-2">
          <Pressable
            onPress={pickCountry}
            accessibilityRole="button"
            accessibilityLabel={`Country code, ${country.name} ${country.dial}. Tap to see available countries.`}
            className="h-12 flex-row items-center gap-1.5 rounded-xl bg-white/5 border border-white/20 px-3 active:opacity-80"
          >
            <Text className="text-[20px]">{flagFor(country.code)}</Text>
            <Text className="text-white text-[17px] font-sans tracking-wide">{country.dial}</Text>
            <SymbolView name="chevron.down" size={11} tintColor="rgba(255,255,255,0.5)" />
          </Pressable>
          <TextInput
            value={formatNational(digits, country)}
            onChangeText={onChangeDigits}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setTouched(true);
            }}
            placeholder={placeholderFor(country)}
            placeholderTextColorClassName="accent-white/30"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel-national"
            className="flex-1 h-12 rounded-xl bg-white/5 border border-white/20 px-4 py-0 text-white text-[18px] font-sans tracking-wide"
            style={
              invalid
                ? { borderColor: '#f87171', borderWidth: 2 }
                : focused
                  ? { borderColor: 'hsl(255, 91%, 76%)', borderWidth: 2 }
                  : undefined
            }
          />
        </View>
        {invalid ? (
          <Text className="text-xs text-red-400 font-sans px-1">{problem}</Text>
        ) : digits.length > 0 && !problem ? (
          <Text className="text-xs text-white/45 font-sans px-1">we&apos;ll text a code to {e164}</Text>
        ) : (
          <Text className="text-xs text-white/45 font-sans px-1">we can only text numbers in {SUPPORTED_LABEL} for now</Text>
        )}
      </View>
      {error ? (
        <Text selectable className="text-sm text-red-400 font-sans">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={send}
        disabled={busy || !!problem}
        className="w-full min-h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-40"
        style={{ backgroundColor: NEON }}
      >
        <Text className="text-black text-base font-sans-semibold">{busy ? 'sending...' : 'send code'}</Text>
      </Pressable>
    </View>
  );
}
