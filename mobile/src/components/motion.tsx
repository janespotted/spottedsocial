import { useEffect, type ReactNode } from 'react';
import { SPRING } from '@/lib/motion';
import type { AccessibilityRole, StyleProp, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/*
 * Motion primitives for Morning After (and anything else that wants to feel
 * physical). Gesture Handler 3 hooks drive the touches on the UI thread;
 * Reanimated 4 springs drive the motion. Everything honours Reduce Motion:
 * loops stop and entrances become a short fade.
 */

type HapticKind = 'light' | 'medium' | 'selection' | 'none';

function fireHaptic(kind: HapticKind) {
  if (kind === 'none') return;
  if (kind === 'selection') void Haptics.selectionAsync();
  else void Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
}

/**
 * A button that sinks under the finger and springs back (Gesture Handler 3
 * tap, UI-thread scale). VoiceOver activation still calls `onPress` through
 * `onAccessibilityTap`, since assistive taps don't reach the native gesture.
 */
export function PressableScale({
  onPress,
  children,
  scaleTo = 0.96,
  haptic = 'light',
  disabled = false,
  className,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityHint,
}: {
  onPress: () => void;
  children: ReactNode;
  scaleTo?: number;
  haptic?: HapticKind;
  disabled?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
}) {
  const pressed = useSharedValue(0);
  const reduce = useReducedMotion();
  const press = () => {
    fireHaptic(haptic);
    onPress();
  };
  const tap = useTapGesture({
    enabled: !disabled,
    maxDuration: 2000,
    // A drag (scrolling the page, swiping a chapter) is not a press.
    maxDistance: 12,
    onBegin: () => {
      'worklet';
      pressed.value = withSpring(1, SPRING.press);
    },
    onActivate: () => {
      'worklet';
      scheduleOnRN(press);
    },
    onFinalize: () => {
      'worklet';
      pressed.value = withSpring(0, SPRING.press);
    },
  });
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: reduce ? 1 : interpolate(pressed.value, [0, 1], [1, scaleTo]) }],
    opacity: interpolate(pressed.value, [0, 1], [disabled ? 0.5 : 1, disabled ? 0.5 : 0.9]),
  }));
  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        className={className}
        style={[style, animated]}
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        onAccessibilityTap={disabled ? undefined : press}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

export interface RevealFrom {
  x?: number;
  y?: number;
  scale?: number;
  /** degrees */
  rotate?: number;
}

/**
 * Springs its children in from `from` to rest (with an optional resting
 * `rotate`, for things that land at an angle). Plays on mount, or — with
 * `when` — the first time `when.value` passes 0.4 (a pager page sliding into
 * view), so a chapter assembles as you swipe to it, not before.
 */
export function Reveal({
  children,
  delay = 0,
  from = { y: 14 },
  rotate = 0,
  spring = SPRING.soft,
  when,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  from?: RevealFrom;
  /** Resting rotation in degrees. */
  rotate?: number;
  spring?: { damping: number; stiffness: number; mass: number };
  when?: SharedValue<number>;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const started = useSharedValue(0);

  const play = () => {
    'worklet';
    if (started.value) return;
    started.value = 1;
    p.value = withDelay(delay, reduce ? withTiming(1, { duration: 160 }) : withSpring(1, spring));
  };

  useEffect(() => {
    if (!when) p.value = withDelay(delay, reduce ? withTiming(1, { duration: 160 }) : withSpring(1, spring));
    // play once on mount; `when` mode is driven by the reaction below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAnimatedReaction(
    () => (when ? when.value > 0.4 : false),
    (visible) => {
      if (visible) play();
    }
  );

  const animated = useAnimatedStyle(() => {
    const t = p.value;
    if (reduce) return { opacity: Math.min(1, t), transform: [{ rotate: `${rotate}deg` }] };
    return {
      opacity: interpolate(t, [0, 0.35], [0, 1], 'clamp'),
      transform: [
        { translateX: interpolate(t, [0, 1], [from.x ?? 0, 0]) },
        { translateY: interpolate(t, [0, 1], [from.y ?? 0, 0]) },
        { scale: interpolate(t, [0, 1], [from.scale ?? 1, 1]) },
        { rotate: `${interpolate(t, [0, 1], [from.rotate ?? rotate, rotate])}deg` },
      ],
    };
  });
  return (
    <Animated.View className={className} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}
