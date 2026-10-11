import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { SpottedMark } from '@/components/spotted-mark';
import { LaunchButton } from '@/components/launch-shell';
import { CheckedInIllustration, LeaderboardIllustration, MapIllustration, SocialNightIllustration } from '@/components/onboarding-illustrations';
import { INTRO_STEPS, readIntroStep, saveIntroStep } from '@/lib/launch-intro';
import { INK, MIST, NEON } from '@/lib/theme';

/** Mounted after profile entry, before the two required nominations. */
export function LaunchIntroduction({ userId, enabled, children }: { userId?: string; enabled: boolean; children: ReactNode }) {
  const [step, setStep] = useState<number | null>(null);
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
  const [reduce, setReduce] = useState(true);
  const locked = useRef(false);
  const motion = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ScrollView>(null);
  const { height, fontScale } = useWindowDimensions();
  const page = INTRO_STEPS[step];
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduce(value); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { active = false; sub.remove(); motion.stopAnimation(); };
  }, [motion]);
  const move = (next: number) => {
    if (locked.current || next < 0 || next > INTRO_STEPS.length) return;
    locked.current = true; setBusy(true);
    void Haptics.selectionAsync().catch(() => {});
    const reveal = () => {
      onStep(next);
      if (next === INTRO_STEPS.length) return;
      setStep(next); scroll.current?.scrollTo({ y: 0, animated: false });
      if (reduce) { locked.current = false; setBusy(false); return; }
      Animated.timing(motion, { toValue: 1, duration: 220, useNativeDriver: true }).start(() => { locked.current = false; setBusy(false); });
    };
    if (reduce) reveal();
    else Animated.timing(motion, { toValue: 0, duration: 90, useNativeDriver: true }).start(({ finished }) => { if (finished) reveal(); });
  };
  return <View style={{ flex: 1, backgroundColor: INK }}>
    <ScrollView ref={scroll} key={fontScale} contentContainerClassName="flex-grow px-7 pt-safe-offset-5 pb-safe-offset-5" showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center justify-between mb-8">
        <View className="flex-row items-center gap-3"><SpottedMark size={30} glow={false} /><Text className="text-white text-sm font-sans-medium" style={{ letterSpacing: 3 }} maxFontSizeMultiplier={1.3}>Spotted</Text></View>
        <Text className="text-xs font-sans" style={{ color: MIST }} accessibilityLabel={`Introduction ${step + 1} of ${INTRO_STEPS.length}`}>{step + 1} / {INTRO_STEPS.length}</Text>
      </View>
      <Animated.View accessibilityLiveRegion="polite" style={{ flex: 1, opacity: motion, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <Text className="text-xs font-sans-medium tracking-widest mb-4" style={{ color: NEON }}>{page.label}</Text>
        <Text accessibilityRole="header" className="text-white text-[34px] leading-[40px] font-sans-light">{page.title}</Text>
        <Text className="text-base leading-6 font-sans mt-3" style={{ color: MIST }}>{page.subtitle}</Text>
        <View className="flex-1 justify-center py-7" style={{ minHeight: 320 }}>
          <View accessible accessibilityLabel={step === 0 ? 'Example: I’m out, The Violet Room, visible to Friends. Confirm your check-in.' : step === 1 ? 'Example map with friends and venue pins. Only shared locations appear.' : step === 2 ? 'Send Meet Ups, venue invites and DMs. Post to your friends in the newsfeed. Everything deletes by 5am - no hangxiety. Your profile and friends stay.' : 'Example leaderboard showing three venues ranked by activity visible to you.'}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
              {step === 0 ? <CheckedInIllustration concise /> : step === 1 ? <View style={{ height: Math.max(300, Math.min(390, height * 0.4)) }}><MapIllustration /></View> : step === 2 ? <SocialNightIllustration /> : <LeaderboardIllustration />}
            </View>
          </View>
          <Text className="text-[10px] font-sans tracking-widest text-center mt-4" style={{ color: MIST }}>A GLIMPSE OF NIGHT MODE</Text>
        </View>
      </Animated.View>
      <View className="flex-row gap-2 mb-5" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{INTRO_STEPS.map((item, i) => <View key={item.label} className="h-0.5 flex-1 rounded-full" style={{ backgroundColor: i <= step ? NEON : 'rgba(255,255,255,0.15)' }} />)}</View>
      <View className="flex-row items-center gap-3">
        {step > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Previous introduction" disabled={busy} onPress={() => move(step - 1)} className="min-h-14 min-w-14 items-center justify-center rounded-2xl border border-white/15 active:opacity-60"><SymbolView name="arrow.left" size={19} tintColor={MIST} /></Pressable> : null}
        <View className="flex-1"><LaunchButton disabled={busy} label={step === INTRO_STEPS.length - 1 ? 'Choose your two' : 'Continue'} onPress={() => move(step + 1)} /></View>
      </View>
    </ScrollView>
  </View>;
}
