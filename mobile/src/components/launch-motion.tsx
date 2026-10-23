import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { NEON } from '@/lib/theme';

export const LAUNCH_EASE = Easing.out(Easing.cubic);
let currentReduceMotion: boolean | undefined;

/** Start with the native preference, then follow changes while onboarding is open. */
export function useLaunchReducedMotion() {
  const initial = useReducedMotion();
  const [reduce, setReduce] = useState(() => currentReduceMotion ?? initial);
  useEffect(() => {
    let active = true;
    let changed = false;
    const update = (value: boolean) => { currentReduceMotion = value; setReduce(value); };
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) update(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; update(value); });
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduce;
}

/** A single entrance, with no idle loops or replays when accessibility settings change. */
export function LaunchReveal({ children, style, delay = 0, illustration = false }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number; illustration?: boolean;
}) {
  const reduce = useLaunchReducedMotion();
  const progress = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const played = useRef(false);
  useEffect(() => {
    if (reduce || played.current) { progress.setValue(1); return; }
    played.current = true;
    const animation = Animated.timing(progress, {
      toValue: 1, duration: illustration ? 280 : 240, delay,
      easing: LAUNCH_EASE, useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [reduce, progress, delay, illustration]);
  return <Animated.View style={[style, {
    opacity: progress,
    transform: [
      { translateY: reduce ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [illustration ? 10 : 6, 0] }) },
      { scale: reduce || !illustration ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
    ],
  }]}>{children}</Animated.View>;
}

export function LaunchProgress({ active, reduce }: { active: boolean; reduce: boolean }) {
  const fill = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { fill.setValue(active ? 1 : 0); return; }
    const animation = Animated.timing(fill, {
      toValue: active ? 1 : 0, duration: 240, easing: LAUNCH_EASE,
      useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, reduce, fill]);
  return <View className="h-0.5 flex-1 rounded-full overflow-hidden bg-white/15">
    <Animated.View style={{ flex: 1, backgroundColor: NEON, transformOrigin: 'left', transform: [{ scaleX: fill }] }} />
  </View>;
}
