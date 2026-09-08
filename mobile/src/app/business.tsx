import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/use-session';
import { ClaimVenueForm } from '@/components/claim-venue-form';
import spottedLogo from '../../assets/images/spotted-s-logo.png';

const PRIMARY = 'hsl(270, 100%, 65%)';

function AuthCard() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(
    null
  );

  const handleAuth = async () => {
    setLoading(true);
    setMessage(null);
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      setMessage(
        error
          ? { kind: 'error', text: error.message }
          : { kind: 'success', text: 'Check your email to confirm your account' }
      );
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) setMessage({ kind: 'error', text: error.message });
      // On success the session updates and this screen swaps to the claim view
    }
  };

  return (
    <View className="bg-white/5 border border-white/10 rounded-xl p-4 pt-6 gap-4">
      <View className="flex-row bg-white/5 border border-white/10 rounded-md p-1">
        {(['signin', 'signup'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            className="flex-1 h-8 rounded items-center justify-center"
            style={mode === m ? { backgroundColor: PRIMARY } : undefined}
          >
            <Text className="text-white text-sm font-sans-medium">
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View>
        <Text className="text-white/60 text-sm font-sans mb-1">Email</Text>
        <TextInput
          keyboardType="email-address"
          autoCapitalize="none"
          textContentType="emailAddress"
          placeholder="you@business.com"
          placeholderTextColorClassName="accent-white/40"
          value={email}
          onChangeText={setEmail}
          className="h-10 rounded-md bg-white/5 border border-white/20 px-3 py-0 text-[15px] text-white font-sans"
        />
      </View>

      <View>
        <Text className="text-white/60 text-sm font-sans mb-1">Password</Text>
        <TextInput
          secureTextEntry
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColorClassName="accent-white/40"
          value={password}
          onChangeText={setPassword}
          className="h-10 rounded-md bg-white/5 border border-white/20 px-3 py-0 text-[15px] text-white font-sans"
        />
      </View>

      <Pressable
        onPress={handleAuth}
        disabled={loading || !email || password.length < 6}
        className="w-full h-10 rounded-md flex-row items-center justify-center gap-2 active:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: PRIMARY }}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <SymbolView name="building.2" size={16} tintColor="#fff" />
        )}
        <Text className="text-white font-sans-medium">
          {mode === 'signup' ? 'Create Account' : 'Sign In'}
        </Text>
      </Pressable>

      {message ? (
        <Text
          selectable
          className={
            message.kind === 'error'
              ? 'text-sm text-red-400 font-sans'
              : 'text-sm text-green-400 font-sans'
          }
        >
          {message.text}
        </Text>
      ) : null}
    </View>
  );
}

function PendingClaims({ userId }: { userId: string }) {
  const { data: claims } = useQuery({
    queryKey: ['pending-claims', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_claim_requests')
        .select('id, venue_name, status, created_at')
        .eq('user_id', userId)
        .eq('status', 'pending');
      if (error) throw error;
      return data;
    },
  });

  if (!claims || claims.length === 0) return null;

  return (
    <View
      className="rounded-xl border p-4 gap-2"
      style={{
        backgroundColor: 'rgba(234, 179, 8, 0.1)',
        borderColor: 'rgba(234, 179, 8, 0.3)',
      }}
    >
      <View className="flex-row items-center gap-2">
        <SymbolView name="clock" size={14} tintColor="#facc15" />
        <Text className="text-sm font-sans-medium" style={{ color: '#facc15' }}>
          Pending Claims
        </Text>
      </View>
      {claims.map((claim) => (
        <View
          key={claim.id}
          className="flex-row items-center justify-between p-2 rounded bg-white/5"
        >
          <Text className="text-white text-sm font-sans">{claim.venue_name}</Text>
          <Text className="text-xs font-sans" style={{ color: '#facc15' }}>
            Under review
          </Text>
        </View>
      ))}
      <Text className="text-white/50 text-xs font-sans mt-2">
        We&apos;ll notify you once your claim is reviewed (usually within 24-48 hours).
      </Text>
    </View>
  );
}

export default function BusinessScreen() {
  const { session } = useSession();

  return (
    <View
      className="flex-1"
      style={{
        experimental_backgroundImage:
          'linear-gradient(to bottom, #2d1b4e, #1a0f2e, #0a0118)',
      }}
    >
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-6 pt-safe-offset-6 pb-safe-offset-6"
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View className="flex-row items-center gap-3 mb-6">
          <Pressable onPress={() => router.back()} hitSlop={12} className="p-2">
            <SymbolView name="arrow.left" size={20} tintColor="#ffffff" />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Image
              source={spottedLogo}
              style={{ width: 32, height: 32 }}
              contentFit="contain"
            />
            <Text className="text-xl font-sans-semibold text-white">
              {session ? 'Claim Your Venue' : 'Business Sign In'}
            </Text>
          </View>
        </View>

        {session ? (
          <View className="gap-6">
            <PendingClaims userId={session.user.id} />
            <ClaimVenueForm />
          </View>
        ) : (
          <AuthCard />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
