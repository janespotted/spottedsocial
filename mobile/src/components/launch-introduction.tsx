import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, Easing, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { SpottedMark } from '@/components/spotted-mark';
import { LaunchButton } from '@/components/launch-shell';
import { LaunchProgress, useLaunchReducedMotion } from '@/components/launch-motion';
import { CheckedInIllustration, LeaderboardIllustration, MapIllustration, SocialNightIllustration } from '@/components/onboarding-illustrations';
import { INTRO_STEPS, cachedIntroStep, readIntroStep, saveIntroStep } from '@/lib/launch-intro';
import { INK, MIST, NEON } from '@/lib/theme';

/** Mounted after profile entry, before the two required nominations. */
export function LaunchIntroduction({ userId, enabled, children, preview = false }: { userId?: string; enabled: boolean; children: ReactNode; preview?: boolean }) {
  const [step, setStep] = useState<number | null>(() => preview ? 0 : cachedIntroStep(userId));
  useEffect(() => {
    let active = true;
    if (!preview && enabled && userId) void readIntroStep(userId).then(value => { if (active) setStep(value); });
    return () => { active = false; };
  }, [userId, enabled]);
  if (!enabled || !userId || step === INTRO_STEPS.length) return children;
  if (step === null) return <View className="flex-1 items-center justify-center" style={{ backgroundColor: INK }} accessibilityLabel="Loading introduction"><SpottedMark size={40} /></View>;
  return <IntroductionPages preview={preview} initialStep={step} onStep={value => {
    if (!preview) void saveIntroStep(userId, value);
    if (value === INTRO_STEPS.length) setStep(value);
  }} />;
}

const PAGE_EASE = Easing.bezier(0.22, 1, 0.36, 1);

export function IntroductionPages({ initialStep, onStep, preview = false }: { preview?: boolean; initialStep: number; onStep: (step: number) => void }) {
  const [step, setStep] = useState(initialStep);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(initialStep);
  const reduce = useLaunchReducedMotion();
  const locked = useRef(false);
  const currentStep = useRef(initialStep);
  const completion = useRef<(() => void) | null>(null);
  const motion = useRef(new Animated.Value(initialStep)).current;
  const scrolls = useRef<(ScrollView | null)[]>([]);
  const { height, width } = useWindowDimensions();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') completion.current?.();
    });
    return () => { completion.current = null; motion.stopAnimation(); subscription.remove(); };
  }, [motion]);
  useEffect(() => {
    if (reduce) {
      if (completion.current) completion.current();
      else { motion.stopAnimation(); motion.setValue(currentStep.current); }
    }
  }, [reduce, motion]);
  const move = (next: number) => {
    if (locked.current || next < 0 || next > INTRO_STEPS.length) return;
    locked.current = true; setBusy(true);
    void Haptics.selectionAsync().catch(() => {});
    const commit = () => {
      if (completion.current !== commit) return;
      completion.current = null;
      motion.stopAnimation();
      currentStep.current = next;
      onStep(next);
      if (next === INTRO_STEPS.length) return;
      motion.setValue(next); setStep(next); setTarget(next);
      locked.current = false; setBusy(false);
    };
    completion.current = commit;
    if (next < INTRO_STEPS.length) setTarget(next);
    scrolls.current[next]?.scrollTo({ y: 0, animated: false });
    if (reduce || next === INTRO_STEPS.length) { commit(); return; }
    // Both pages are already laid out. A single native animation moves them
    // together, with no fade-to-empty, remount, or JS callback in the middle.
    Animated.timing(motion, { toValue: next, duration: 420, easing: PAGE_EASE, useNativeDriver: true, isInteraction: false }).start(({ finished }) => {
      if (completion.current !== commit) return;
      if (finished) commit();
      else { completion.current = null; motion.setValue(currentStep.current); setTarget(currentStep.current); locked.current = false; setBusy(false); }
    });
  };
  return <View style={{ flex: 1, backgroundColor: INK }}>
      <View className={preview ? "flex-row items-center justify-between px-7 pt-5 pb-6" : "flex-row items-center justify-between px-7 pt-safe-offset-5 pb-6"}>
        <View className="flex-row items-center gap-2">
          {step > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Previous introduction" disabled={busy} onPress={() => move(step - 1)} className="h-11 w-11 items-center justify-center rounded-full border border-white/15 active:opacity-60"><SymbolView name="arrow.left" size={19} tintColor={MIST} /></Pressable> : <View className="h-11 w-11 items-center justify-center"><SpottedMark size={30} glow={false} /></View>}
          <Text className="text-white text-sm font-sans-medium" style={{ letterSpacing: 3 }} maxFontSizeMultiplier={1.3}>Spotted</Text>
        </View>
        <Text className="text-xs font-sans" style={{ color: MIST }} accessibilityLabel={`Introduction ${step + 1} of ${INTRO_STEPS.length}`}>{step + 1} / {INTRO_STEPS.length}</Text>
      </View>
      <View style={{ flex: 1, overflow: 'hidden' }}>
      {INTRO_STEPS.map((page, index) => <Animated.View key={page.label}
        pointerEvents={index === step && !busy ? 'auto' : 'none'}
        aria-hidden={index !== step}
        accessibilityElementsHidden={index !== step}
        importantForAccessibility={index === step ? 'auto' : 'no-hide-descendants'}
        style={{ position: 'absolute', inset: 0, backgroundColor: INK,
          transform: [{ translateX: motion.interpolate({ inputRange: [index - 1, index, index + 1], outputRange: [width, 0, -width], extrapolate: 'clamp' }) }] }}>
      <ScrollView ref={ref => { scrolls.current[index] = ref; }} scrollEnabled={index === step && !busy} contentContainerClassName="flex-grow px-7 pb-3" showsVerticalScrollIndicator={false}>
        <Text className="text-xs font-sans-medium tracking-widest mb-4" style={{ color: NEON }}>{page.label}</Text>
        <Text accessibilityRole="header" className="text-white text-[34px] leading-[40px] font-sans-light">{page.title}</Text>
        <Text className="text-base leading-6 font-sans mt-3" style={{ color: MIST }}>{page.subtitle}</Text>
        <View className="flex-1 justify-center py-7" style={{ minHeight: 320 }}>
          <View accessible accessibilityLabel={index === 0 ? 'Example: I’m out, The Violet Room, visible to Friends. Confirm your check-in.' : index === 1 ? 'Example map with friends and venue pins. Only shared locations appear.' : index === 2 ? 'Send Meet Ups, venue invites and DMs. Post to your friends in the newsfeed. Tonight clears at 5am — no hangxiety. Your profile and friends stay.' : 'Example leaderboard showing three venues ranked by activity visible to you.'}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
              {index === 0 ? <CheckedInIllustration concise animated active={index === step || index === target} /> : index === 1 ? <View style={{ height: Math.max(300, Math.min(390, height * 0.4)) }}><MapIllustration animated active={index === step || index === target} /></View> : index === 2 ? <SocialNightIllustration animated active={index === step || index === target} /> : <LeaderboardIllustration animated active={index === step || index === target} />}
            </View>
          </View>
          <Text className="text-[10px] font-sans tracking-widest text-center mt-4" style={{ color: MIST }}>A GLIMPSE OF NIGHT MODE</Text>
        </View>
      </ScrollView>
      </Animated.View>)}
      </View>
      <View className="px-7 pt-4 pb-safe-offset-5">
      <View className="flex-row gap-2 mb-5" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{INTRO_STEPS.map((item, i) => <LaunchProgress key={item.label} active={i <= step} reduce={reduce} />)}</View>
      <LaunchButton transitioning={busy} label={step === INTRO_STEPS.length - 1 ? 'Choose your two' : 'Continue'} onPress={() => move(step + 1)} />
      </View>
  </View>;
}
