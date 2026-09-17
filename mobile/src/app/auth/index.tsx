import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { supabase } from '@/lib/supabase';
import { SpottedMark } from '@/components/spotted-mark';
import { NEON } from '@/lib/theme';

/** Same as the web app: keep digits and "+" only — no country mask,
 * so international numbers (+92, +44, …) pass through untouched. */
function formatPhoneForDisplay(value: string): string {
  return value.replace(/[^\d+]/g, '');
}

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
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const sendCode = async () => {
    const cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.length < 10) {
      setError('please enter a valid phone number');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: cleaned });
    setBusy(false);
    if (err) {
      setError(err.message.includes('Invalid phone') ? 'invalid phone number' : err.message);
      return;
    }
    router.push({ pathname: '/auth/otp', params: { phone: cleaned } });
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
            <TextInput
              value={phone}
              onChangeText={(t) => setPhone(formatPhoneForDisplay(t))}
              onFocus={() => setFocused('phone')}
              onBlur={() => setFocused(null)}
              placeholder="+1 (555) 000-0000"
              placeholderTextColorClassName="accent-white/30"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoFocus
              className={inputClass}
              style={focused === 'phone' ? focusedStyle : undefined}
            />
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
            disabled={busy}
            className="w-full min-h-12 rounded-2xl items-center justify-center active:opacity-90"
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
