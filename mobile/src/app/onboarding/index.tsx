import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ProgressDots } from '@/components/progress-dots';

const NEON = '#d4ff00';

export default function NameScreen() {
  const [displayName, setDisplayName] = useState('');
  const [focused, setFocused] = useState(false);

  const handleContinue = () => {
    if (!displayName.trim()) return;
    router.push({ pathname: '/onboarding/username', params: { displayName: displayName.trim() } });
  };

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-[#110a24]"
      contentContainerClassName="flex-grow px-6 pt-safe-offset-5 pb-safe-offset-6"
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      <ProgressDots current={2} total={4} />

      <View className="mt-12 mb-10">
        <Text className="text-[28px] font-sans-light text-white leading-tight">
          what should we call you?
        </Text>
        <Text className="text-sm text-white/40 font-sans mt-2">
          this is how you&apos;ll show up to friends
        </Text>
      </View>

      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="your name"
        placeholderTextColorClassName="accent-white/20"
        maxLength={50}
        autoFocus
        className="w-full bg-transparent text-white text-[28px] font-sans-light border-b border-white/15 pb-3"
        style={focused ? { borderBottomColor: 'rgba(212,255,0,0.5)' } : undefined}
      />

      <View className="mt-auto pt-12">
        <Pressable
          onPress={handleContinue}
          disabled={!displayName.trim()}
          className="w-full h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-30"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-black text-base font-sans-semibold">continue</Text>
        </Pressable>
      </View>
    </KeyboardAwareScrollView>
  );
}
