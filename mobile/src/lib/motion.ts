import { useEffect } from 'react';
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** Springs used across the feature, so motion reads as one family. */
export const SPRING = {
  /** Press feedback: quick, no wobble. */
  press: { damping: 22, stiffness: 420, mass: 0.6 },
  /** Things landing on the table (tickets, polaroids). A little overshoot. */
  land: { damping: 14, stiffness: 160, mass: 0.9 },
  /** Pages and the lightbox: settles fast, keeps the swipe's velocity. */
  page: { damping: 24, stiffness: 220, mass: 0.9 },
  /** Soft entrances (cards, rows). */
  soft: { damping: 20, stiffness: 140, mass: 1 },
} as const;

/**
 * A slow idle drift (bob + a degree of sway) for scrapbook pieces, so a card
 * feels alive without demanding attention. `phase` desynchronises siblings.
 */
export function useFloat(amplitude = 3, period = 2600, phase = 0) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withDelay(
      phase,
      withRepeat(
        withSequence(withTiming(1, { duration: period / 2 }), withTiming(0, { duration: period / 2 })),
        -1,
        false
      )
    );
  }, [reduce, period, phase, t]);
  return useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 1], [0, -amplitude]) },
      { rotate: `${interpolate(t.value, [0, 1], [-0.6, 0.6])}deg` },
    ],
  }));
}

/** A small "nudge" loop for a call-to-action arrow. */
export function useNudge(distance = 3, every = 2400) {
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(
      withSequence(
        withDelay(every, withTiming(distance, { duration: 180 })),
        withSpring(0, { damping: 6, stiffness: 260, mass: 0.6 })
      ),
      -1,
      false
    );
  }, [reduce, distance, every, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}
