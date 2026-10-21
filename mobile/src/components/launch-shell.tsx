import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SpottedMark } from '@/components/spotted-mark';
import { LaunchReveal, useLaunchReducedMotion } from '@/components/launch-motion';
import { SPRING } from '@/lib/motion';
import { INK, MIST, NEON } from '@/lib/theme';
export function LaunchShell({ title, subtitle, step, children, preview = false, focused = false }: { preview?: boolean; focused?: boolean; title: string; subtitle: string; step?: number; children: ReactNode }) {
  const heading = <>
    <Text accessibilityRole="header" className={`text-white text-[34px] leading-[39px] font-sans-light${focused ? ' text-center' : ''}`}>{title}</Text>
    <Text style={{ color: MIST, ...(focused ? { maxWidth: 285 } : {}) }} className={`text-base leading-6 font-sans mt-3${focused ? ' text-center' : ' mb-8'}`}>{subtitle}</Text>
  </>;
  return <KeyboardAwareScrollView style={{ flex: 1, backgroundColor: INK }} contentContainerClassName={preview ? "flex-grow px-7 pt-6 pb-safe-offset-6" : "flex-grow px-7 pt-safe-offset-6 pb-safe-offset-6"} keyboardShouldPersistTaps="handled" bottomOffset={24}>
    <View className={`flex-row items-center justify-between${focused ? '' : ' mb-10'}`}><SpottedMark size={36} />{!focused ? <Text style={{ color: MIST }} className="text-xs font-sans-medium tracking-widest flex-1 text-right ml-4">NEW YORK · FIRST WAVE</Text> : null}</View>
    <LaunchReveal key={title} style={{ flex: 1 }}>
      {step !== undefined ? <Text style={{ color: NEON }} className="text-xs font-sans-medium tracking-widest mb-4" accessibilityLabel={`Step ${step} of 2`}>{step === 1 ? '01 / YOUR PROFILE' : '02 / YOUR TWO'}</Text> : null}
      {focused ? <View className="items-center pt-16 pb-10">{heading}</View> : heading}
      {children}
    </LaunchReveal>
  </KeyboardAwareScrollView>;
}
export function LaunchButton({ label, onPress, disabled = false, transitioning = false }: {
  label: string; onPress: () => void; disabled?: boolean; transitioning?: boolean;
}) {
  const reduce = useLaunchReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const blocked = disabled || transitioning;
  useEffect(() => {
    if (reduce) { scale.stopAnimation(); scale.setValue(1); }
    else if (blocked) Animated.spring(scale, { toValue: 1, ...SPRING.press, useNativeDriver: true }).start();
  }, [blocked, reduce, scale]);
  useEffect(() => () => scale.stopAnimation(), [scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked, busy: transitioning }} disabled={blocked} onPress={onPress}
      onPressIn={() => { if (!reduce) Animated.timing(scale, { toValue: 0.985, duration: 85, useNativeDriver: true }).start(); }}
      onPressOut={() => { if (!reduce) Animated.spring(scale, { toValue: 1, ...SPRING.press, useNativeDriver: true }).start(); }}
      className="min-h-14 rounded-2xl items-center justify-center px-5 py-4"
      style={({ pressed }) => ({ backgroundColor: NEON, opacity: disabled ? 0.35 : pressed ? 0.94 : 1 })}>
      <Text className="text-base font-sans-semibold text-center" style={{ color: INK }}>{label}</Text>
    </Pressable>
  </Animated.View>;
}
