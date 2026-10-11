import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { SpottedMark } from '@/components/spotted-mark';
import { LaunchButton } from '@/components/launch-shell';
import { LAUNCH_EASE, LaunchProgress, LaunchReveal, useLaunchReducedMotion } from '@/components/launch-motion';
import { CheckedInIllustration, LeaderboardIllustration, MapIllustration, SocialNightIllustration } from '@/components/onboarding-illustrations';
import { INTRO_STEPS, cachedIntroStep, readIntroStep, saveIntroStep } from '@/lib/launch-intro';
import { INK, MIST, NEON } from '@/lib/theme';

/** Mounted after profile entry, before the two required nominations. */
export function LaunchIntroduction({ userId, enabled, children }: { userId?: string; enabled: boolean; children: ReactNode }) {
  const [step, setStep] = useState<number | null>(() => cachedIntroStep(userId));
  useEffect(() => {
    let active = true;
    if (enabled && userId) void readIntroStep(userId).then(value => { if (active) setStep(value); });
    return () => { active = false; };
  }, [userId, enabled]);
  if (!enabled || !userId || step === INTRO_STEPS.length) return children;
  if (step === null) return <View className="flex-1 items-center justify-center" style={{ backgroundColor: INK }} accessibilityLabel="Loading introduction"><SpottedMark size={40} /></View>;
  return <IntroductionPages initialStep={step} onStep={value => {
    void saveIntroStep(userId, value);
    if (value === INTRO_STEPS.length) setStep(value);
  }} />;
}

function IntroductionPages({ initialStep, onStep }: { initialStep: number; onStep: (step: number) => void }) {
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const reduce = useLaunchReducedMotion();
  const locked = useRef(false);
  const motion = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ScrollView>(null);
  const { height, fontScale } = useWindowDimensions();
  const page = INTRO_STEPS[step];
  useEffect(() => () => motion.stopAnimation(), [motion]);
  useEffect(() => {
    if (reduce) { motion.stopAnimation(); motion.setValue(1); locked.current = false; setBusy(false); }
  }, [reduce, motion]);
  const move = (next: number) => {
    if (locked.current || next < 0 || next > INTRO_STEPS.length) return;
    locked.current = true; setBusy(true);
    void Haptics.selectionAsync().catch(() => {});
    const reveal = () => {
      onStep(next);
      if (next === INTRO_STEPS.length) return;
      setStep(next); scroll.current?.scrollTo({ y: 0, animated: false });
      if (reduce) { motion.setValue(1); locked.current = false; setBusy(false); return; }
      Animated.timing(motion, { toValue: 1, duration: 220, easing: LAUNCH_EASE, useNativeDriver: true }).start(() => { locked.current = false; setBusy(false); });
    };
    if (reduce) reveal();
    else Animated.timing(motion, { toValue: 0, duration: 80, useNativeDriver: true }).start(({ finished }) => {
      if (finished) reveal();
      else { motion.setValue(1); locked.current = false; setBusy(false); }
    });
  };
  return <LaunchReveal style={{ flex: 1, backgroundColor: INK }}>
    <ScrollView ref={scroll} key={fontScale} contentContainerClassName="flex-grow px-7 pt-safe-offset-5 pb-safe-offset-5" showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center justify-between mb-8">
        <View className="flex-row items-center gap-2">
          {step > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Previous introduction" disabled={busy} onPress={() => move(step - 1)} className="h-11 w-11 items-center justify-center rounded-full border border-white/15 active:opacity-60"><SymbolView name="arrow.left" size={19} tintColor={MIST} /></Pressable> : <View className="h-11 w-11 items-center justify-center"><SpottedMark size={30} glow={false} /></View>}
          <Text className="text-white text-sm font-sans-medium" style={{ letterSpacing: 3 }} maxFontSizeMultiplier={1.3}>Spotted</Text>
        </View>
        <Text className="text-xs font-sans" style={{ color: MIST }} accessibilityLabel={`Introduction ${step + 1} of ${INTRO_STEPS.length}`}>{step + 1} / {INTRO_STEPS.length}</Text>
      </View>
      <Animated.View accessibilityLiveRegion="polite" style={{ flex: 1, opacity: motion, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <Text className="text-xs font-sans-medium tracking-widest mb-4" style={{ color: NEON }}>{page.label}</Text>
        <Text accessibilityRole="header" className="text-white text-[34px] leading-[40px] font-sans-light">{page.title}</Text>
        <Text className="text-base leading-6 font-sans mt-3" style={{ color: MIST }}>{page.subtitle}</Text>
        <View className="flex-1 justify-center py-7" style={{ minHeight: 320 }}>
          <LaunchReveal key={step} delay={35} illustration>
          <View accessible accessibilityLabel={step === 0 ? 'Example: I’m out, The Violet Room, visible to Friends. Confirm your check-in.' : step === 1 ? 'Example map with friends and venue pins. Only shared locations appear.' : step === 2 ? 'Send Meet Ups, venue invites and DMs. Post to your friends in the newsfeed. Everything deletes by 5am - no hangxiety. Your profile and friends stay.' : 'Example leaderboard showing three venues ranked by activity visible to you.'}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
              {step === 0 ? <CheckedInIllustration concise animated /> : step === 1 ? <View style={{ height: Math.max(300, Math.min(390, height * 0.4)) }}><MapIllustration animated /></View> : step === 2 ? <SocialNightIllustration animated /> : <LeaderboardIllustration animated />}
            </View>
          </View>
          </LaunchReveal>
          <Text className="text-[10px] font-sans tracking-widest text-center mt-4" style={{ color: MIST }}>A GLIMPSE OF NIGHT MODE</Text>
        </View>
      </Animated.View>
      <View className="flex-row gap-2 mb-5" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{INTRO_STEPS.map((item, i) => <LaunchProgress key={item.label} active={i <= step} reduce={reduce} />)}</View>
      <LaunchButton transitioning={busy} label={step === INTRO_STEPS.length - 1 ? 'Choose your two' : 'Continue'} onPress={() => move(step + 1)} />
    </ScrollView>
  </LaunchReveal>;
}
