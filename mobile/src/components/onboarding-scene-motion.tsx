import { useEffect, useRef } from 'react';
import { Animated, AppState, Easing } from 'react-native';
import { useLaunchReducedMotion } from '@/components/launch-motion';
import { NEON } from '@/lib/theme';

/** One native timeline per illustration. Never holds up navigation or loops. */
export function useSceneMotion(enabled: boolean) {
  const reduce = useLaunchReducedMotion();
  const time = useRef(new Animated.Value(enabled && !reduce ? 0 : 1)).current;
  const played = useRef(false);
  useEffect(() => {
    if (!enabled || reduce || played.current || AppState.currentState !== 'active') {
      time.setValue(1);
      return;
    }
    played.current = true;
    const animation = Animated.timing(time, {
      toValue: 1, duration: 1600, delay: 100, easing: Easing.linear,
      useNativeDriver: true, isInteraction: false,
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { animation.stop(); time.setValue(1); }
    });
    animation.start();
    return () => { animation.stop(); subscription.remove(); };
  }, [enabled, reduce, time]);
  return time;
}

/** A quick eased arrival along the shared timeline, without changing layout. */
export function sceneArrival(time: Animated.Value, start: number, pin = false) {
  const inputRange = [start, start + 0.10, start + 0.22];
  return {
    opacity: time.interpolate({ inputRange, outputRange: [0, 0.85, 1], extrapolate: 'clamp' }),
    transform: [
      { translateY: time.interpolate({ inputRange, outputRange: [pin ? 12 : 8, 1, 0], extrapolate: 'clamp' }) },
      { scale: time.interpolate({ inputRange, outputRange: [pin ? 0.72 : 0.97, pin ? 1.025 : 0.997, 1], extrapolate: 'clamp' }) },
    ],
  };
}

/** A single location signal, clipped inside the map; invisible at rest. */
export function SceneHalo({ time, start = 0.3, size = 58 }: { time: Animated.Value; start?: number; size?: number }) {
  return <Animated.View pointerEvents="none" style={{
    position: 'absolute', width: size, height: size, borderRadius: size / 2,
    borderWidth: 1, borderColor: NEON,
    opacity: time.interpolate({ inputRange: [start, start + 0.08, start + 0.48], outputRange: [0, 0.42, 0], extrapolate: 'clamp' }),
    transform: [{ scale: time.interpolate({ inputRange: [start, start + 0.48], outputRange: [0.45, 2.4], extrapolate: 'clamp' }) }],
  }} />;
}
