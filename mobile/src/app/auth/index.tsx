import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { supabase } from '@/lib/supabase';
import { SpottedMark } from '@/components/spotted-mark';
import {
  DEFAULT_COUNTRY,
  flagFor,
  formatNational,
  openCountryPicker,
  placeholderFor,
  toE164,
  validateNational,
  type Country,
} from '@/lib/country-codes';
import { NEON } from '@/lib/theme';

/** Ambient floating orb — approximates the web app's blurred gradient circles. */
function Orb({ style, color }: { style: object; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          experimental_backgroundImage: `radial-gradient(circle, ${color} 0%, rgba(0,0,0,0) 70%)`,
        },
        style,
      ]}
    />
  );
}

export default function PhoneScreen() {
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  /** National digits only — the country carries the "+" prefix. */
  const [digits, setDigits] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Nothing is marked wrong until the field has been left or submitted —
  // flagging "too short" on the first keystroke is the confusing part.
  const [touched, setTouched] = useState(false);

  const phoneProblem = useMemo(
    () => validateNational(digits, country),
    [digits, country],
  );

  const onChangeDigits = (text: string) => {
    // Pasting a full E.164 number (or one with spaces/brackets) should not
    // become part of the national number — drop the country's own prefix.
    let next = text.replace(/\D/g, '');
    const prefix = country.dial.slice(1);
    if (text.trim().startsWith('+') && next.startsWith(prefix)) {
      next = next.slice(prefix.length);
    }
    // The field shows the FORMATTED number, so backspacing a separator
    // ")" or "-" leaves the digits unchanged and the character would spring
    // back. Deleting a separator deletes the digit before it instead.
    if (next === digits && text.length < formatNational(digits, country).length) {
      next = next.slice(0, -1);
    }
    const max = country.nsnLength ?? 15;
    setDigits(next.slice(0, max));
    setError(null);
  };

  const pickCountry = () => {
    setError(null);
    openCountryPicker({
      selected: country.code,
      onSelect: (next) => {
        setCountry(next);
        // A number typed for one country rarely survives the switch; keep
        // it, but re-check it against the new rules.
        setDigits((d) => d.slice(0, next.nsnLength ?? 15));
      },
    });
  };

  const sendCode = async () => {
    setTouched(true);
    if (phoneProblem) {
      setError(phoneProblem);
      return;
    }
    const e164 = toE164(digits, country);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) {
      setError(err.message.includes('Invalid phone') ? 'invalid phone number' : err.message);
      return;
    }
    router.push({ pathname: '/auth/otp', params: { phone: e164 } });
  };

  const signInWithEmail = async () => {
    if (!email.includes('@') || password.length < 6) {
      setError('please enter your email and password');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      setError(
        err.message.includes('Email not confirmed')
          ? 'email not confirmed yet — check your inbox for the confirmation link'
          : err.message.toLowerCase(),
      );
    }
    // On success the session listener redirects automatically.
  };

  const switchMode = (next: 'phone' | 'email') => {
    setMode(next);
    setError(null);
  };

  const inputClass =
    'h-12 rounded-xl bg-white/5 border border-white/20 px-4 py-0 text-white text-[18px] font-sans tracking-wide';
  const focusedStyle = { borderColor: 'hsl(255, 91%, 76%)', borderWidth: 2 } as const;
  const invalidStyle = { borderColor: '#f87171', borderWidth: 2 } as const;

  return (
    <View className="flex-1 bg-[#110a24]">
      <Orb color="rgba(168,85,247,0.20)" style={{ top: -80, left: -80, width: 256, height: 256 }} />
      <Orb color="rgba(236,72,153,0.15)" style={{ top: '25%', right: -128, width: 320, height: 320 }} />
      <Orb color="rgba(168,85,247,0.15)" style={{ bottom: -128, left: '25%', width: 288, height: 288 }} />

      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="flex-grow items-center justify-center px-6"
        keyboardShouldPersistTaps="handled"
        bottomOffset={32}
      >
        <View style={{ marginBottom: 16 }}>
          <SpottedMark size={64} />
        </View>
        <Text
          className="text-white text-4xl font-sans-light mb-2"
          style={{ letterSpacing: 9 }}
        >
          Spotted
        </Text>
        <Text className="text-white/50 text-base font-sans mb-8">
          see where your friends are tonight
        </Text>

        <View className="w-full gap-5">
          {mode === 'phone' ? (
            <View className="gap-2">
              <View className="flex-row gap-2">
                <Pressable
                  onPress={pickCountry}
                  accessibilityRole="button"
                  accessibilityLabel={`Country code, ${country.name} ${country.dial}. Tap to see available countries.`}
                  className="h-12 flex-row items-center gap-1.5 rounded-xl bg-white/5 border border-white/20 px-3 active:opacity-80"
                >
                  <Text className="text-[20px]">{flagFor(country.code)}</Text>
                  <Text className="text-white text-[17px] font-sans tracking-wide">
                    {country.dial}
                  </Text>
                  <SymbolView
                    name="chevron.down"
                    size={11}
                    tintColor="rgba(255,255,255,0.5)"
                  />
                </Pressable>
                <TextInput
                  value={formatNational(digits, country)}
                  onChangeText={onChangeDigits}
                  onFocus={() => setFocused('phone')}
                  onBlur={() => {
                    setFocused(null);
                    setTouched(true);
                  }}
                  placeholder={placeholderFor(country)}
                  placeholderTextColorClassName="accent-white/30"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel-national"
                  autoFocus
                  className={`flex-1 ${inputClass}`}
                  style={
                    touched && phoneProblem && digits.length > 0
                      ? invalidStyle
                      : focused === 'phone'
                        ? focusedStyle
                        : undefined
                  }
                />
              </View>
              {/* One line under the field: what's wrong, or what will be
                  sent — so "we texted +1…" is never a surprise. */}
              {touched && phoneProblem && digits.length > 0 ? (
                <Text className="text-xs text-red-400 font-sans px-1">{phoneProblem}</Text>
              ) : digits.length > 0 && !phoneProblem ? (
                <Text className="text-xs text-white/45 font-sans px-1">
                  we&apos;ll text a code to {toE164(digits, country)}
                </Text>
              ) : (
                <Text className="text-xs text-white/45 font-sans px-1">
                  we&apos;re US-only for now — enter a {country.dial} number
                </Text>
              )}
            </View>
          ) : (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                placeholder="you@email.com"
                placeholderTextColorClassName="accent-white/30"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                className={inputClass}
                style={focused === 'email' ? focusedStyle : undefined}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder="password"
                placeholderTextColorClassName="accent-white/30"
                textContentType="password"
                secureTextEntry
                autoCapitalize="none"
                className={inputClass}
                style={focused === 'password' ? focusedStyle : undefined}
                onSubmitEditing={signInWithEmail}
              />
            </>
          )}
          {error ? (
            <Text selectable className="text-sm text-red-400 font-sans">
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={mode === 'phone' ? sendCode : signInWithEmail}
            disabled={busy || (mode === 'phone' && !!phoneProblem)}
            className="w-full min-h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: NEON }}
          >
            <Text className="text-black text-base font-sans-semibold">
              {busy ? (mode === 'phone' ? 'sending...' : 'signing in...') : 'continue'}
            </Text>
          </Pressable>
          {/* Email/password was the Twilio-outage workaround (SOW FIX #12:
              phone-OTP only). Toggle hidden per client; uncomment to restore.
              NOTE: with Twilio still suspended, fresh sign-ins are impossible
              while this is hidden — existing sessions are unaffected.
          <Text
            className="text-sm text-center text-white/55 font-sans underline"
            onPress={() => switchMode(mode === 'phone' ? 'email' : 'phone')}
          >
            {mode === 'phone' ? 'sign in with email instead' : 'sign in with phone instead'}
          </Text>
          */}
          <Text className="text-xs text-center text-white/55 font-sans">
            by continuing, you agree to our{' '}
            <Text
              className="text-white/60 underline"
              onPress={() => router.push('/terms')}
            >
              terms
            </Text>{' '}
            and{' '}
            <Text
              className="text-white/60 underline"
              onPress={() => router.push('/privacy')}
            >
              privacy policy
            </Text>
          </Text>
        </View>

        <View className="mt-8">
          <Text
            className="text-sm text-white/55 font-sans"
            onPress={() => router.push('/business')}
          >
            own a venue? <Text className="underline">sign in for business</Text>
          </Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
