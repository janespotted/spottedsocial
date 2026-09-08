import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/use-session';
import { ProgressDots } from '@/components/progress-dots';

const NEON = '#d4ff00';
const USERNAME_REGEX = /^[a-z0-9_.]{3,20}$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'support', 'spotted', 'anthropic', 'help', 'official',
  'mod', 'moderator', 'system', 'staff', 'team', 'root', 'api',
]);

export default function UsernameScreen() {
  const { displayName } = useLocalSearchParams<{ displayName: string }>();
  const { session } = useSession();
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsernameAvailability = useCallback(async (value: string) => {
    if (!USERNAME_REGEX.test(value)) {
      setUsernameAvailable(null);
      setUsernameError('use lowercase letters, numbers, _ or .');
      setSuggestions([]);
      return;
    }
    if (RESERVED_USERNAMES.has(value)) {
      setUsernameAvailable(false);
      setUsernameError("that one's reserved");
      setSuggestions([]);
      return;
    }
    setUsernameChecking(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', value)
        .maybeSingle();
      if (data) {
        setUsernameAvailable(false);
        setUsernameError("that one's taken");
        const alts = [`${value}2`, `${value}_`, `${value}${Math.floor(Math.random() * 99)}`];
        const { data: taken } = await supabase
          .from('profiles')
          .select('username')
          .in('username', alts);
        const takenSet = new Set(taken?.map((t) => t.username) ?? []);
        setSuggestions(alts.filter((a) => !takenSet.has(a)).slice(0, 3));
      } else {
        setUsernameAvailable(true);
        setUsernameError(null);
        setSuggestions([]);
      }
    } catch {
      setUsernameAvailable(null);
    } finally {
      setUsernameChecking(false);
    }
  }, []);

  const handleUsernameChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20);
    setUsername(cleaned);
    setUsernameAvailable(null);
    setUsernameError(null);
    setSuggestions([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (cleaned.length >= 3) {
      debounceRef.current = setTimeout(() => checkUsernameAvailability(cleaned), 500);
    } else if (cleaned.length > 0) {
      setUsernameError('at least 3 characters');
    }
  };

  const handleCreateProfile = async () => {
    if (!usernameAvailable || !agreedToTerms || !session) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.from('profiles').upsert({
      id: session.user.id,
      display_name: (displayName ?? '').trim(),
      username: username.trim(),
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/onboarding/city');
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-[#110a24]"
      contentContainerClassName="flex-grow px-6 pt-safe-offset-5 pb-safe-offset-6"
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        className="absolute left-4 top-safe-offset-5 p-2 z-10"
      >
        <SymbolView name="arrow.left" size={20} tintColor="rgba(255,255,255,0.6)" />
      </Pressable>

      <ProgressDots current={3} total={5} />

      <View className="mt-12 mb-10">
        <Text className="text-[28px] font-sans-light text-white leading-tight">
          pick a username
        </Text>
        <Text className="text-sm text-white/40 font-sans mt-2">
          lowercase letters, numbers, underscores, and periods. 3-20 characters.
        </Text>
      </View>

      <View className="flex-row items-center border-b border-white/15" style={focused ? { borderBottomColor: 'rgba(212,255,0,0.5)' } : undefined}>
        <Text className="text-[28px] font-sans-light text-white/30 pb-3">@</Text>
        <TextInput
          value={username}
          onChangeText={handleUsernameChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="username"
          placeholderTextColorClassName="accent-white/20"
          maxLength={20}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          className="flex-1 bg-transparent text-white text-[28px] font-sans-light pb-3 pl-2"
        />
        {username.length >= 3 ? (
          <View className="pb-3">
            {usernameChecking ? (
              <ActivityIndicator size="small" color={NEON} />
            ) : usernameAvailable === true ? (
              <SymbolView name="checkmark" size={20} tintColor="#22c55e" />
            ) : null}
          </View>
        ) : null}
      </View>

      {usernameError ? (
        <Text className="text-sm text-white/40 font-sans mt-2">{usernameError}</Text>
      ) : null}

      {suggestions.length > 0 ? (
        <View className="flex-row gap-2 mt-3">
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                setUsername(s);
                checkUsernameAvailability(s);
              }}
              className="px-3 py-1.5 rounded-full border border-white/15 active:bg-white/5"
            >
              <Text className="text-sm text-white/60 font-sans">@{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => setAgreedToTerms((v) => !v)}
        className="flex-row items-start gap-3 mt-8"
      >
        <View
          className="mt-0.5 h-4 w-4 rounded border items-center justify-center"
          style={{
            borderColor: agreedToTerms ? NEON : 'rgba(255,255,255,0.3)',
            backgroundColor: agreedToTerms ? NEON : 'transparent',
          }}
        >
          {agreedToTerms ? <SymbolView name="checkmark" size={10} tintColor="#000" /> : null}
        </View>
        <Text className="text-xs text-white/40 font-sans flex-1">
          i agree to the{' '}
          <Text className="text-white/60 underline" onPress={() => router.push('/terms')}>
            terms of service
          </Text>{' '}
          and{' '}
          <Text className="text-white/60 underline" onPress={() => router.push('/privacy')}>
            privacy policy
          </Text>
        </Text>
      </Pressable>

      {error ? (
        <Text selectable className="text-sm text-red-400 font-sans mt-4">
          {error}
        </Text>
      ) : null}

      <View className="mt-auto pt-8">
        <Pressable
          onPress={handleCreateProfile}
          disabled={loading || !usernameAvailable || !agreedToTerms}
          className="w-full h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-30"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-black text-base font-sans-semibold">
            {loading ? 'creating...' : 'get started'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
}
