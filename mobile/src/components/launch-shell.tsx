import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SpottedMark } from '@/components/spotted-mark';
import { INK, MIST, NEON } from '@/lib/theme';
export function LaunchShell({ title, subtitle, step, children }: { title: string; subtitle: string; step?: number; children: ReactNode }) {
  const progress = useRef(new Animated.Value(1)).current;
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduce(value); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { alive = false; sub.remove(); };
  }, []);
  useEffect(() => {
    if (reduce) { progress.setValue(1); return; }
    progress.setValue(0);
    const motion = Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true });
    motion.start(); return () => motion.stop();
  }, [title, reduce, progress]);
  return <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: INK }} contentContainerClassName="flex-grow px-7 pt-safe-offset-6 pb-safe-offset-6" keyboardShouldPersistTaps="handled" bottomOffset={24}>
    <View className="flex-row items-center justify-between mb-10"><SpottedMark size={36} /><Text style={{ color: MIST }} className="text-xs font-sans-medium tracking-widest flex-1 text-right ml-4">NEW YORK · FIRST WAVE</Text></View>
    <Animated.View style={{ flex: 1, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      {step !== undefined ? <Text style={{ color: NEON }} className="text-xs font-sans-medium tracking-widest mb-4" accessibilityLabel={`Step ${step} of 2`}>{step === 1 ? '01 / YOUR PROFILE' : '02 / YOUR TWO'}</Text> : null}
      <Text accessibilityRole="header" className="text-white text-[34px] leading-[39px] font-sans-light">{title}</Text>
      <Text style={{ color: MIST }} className="text-base leading-6 font-sans mt-3 mb-8">{subtitle}</Text>
      {children}
    </Animated.View>
  </KeyboardAwareScrollView>;
}
export function LaunchButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} className="min-h-14 rounded-2xl items-center justify-center px-5 py-4 active:opacity-80" style={{ backgroundColor: NEON, opacity: disabled ? 0.35 : 1 }}><Text className="text-base font-sans-semibold text-center" style={{ color: INK }}>{label}</Text></Pressable>;
}
