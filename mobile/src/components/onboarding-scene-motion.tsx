import { useEffect, useRef } from 'react';
import { Animated, AppState, Easing } from 'react-native';
import { useLaunchReducedMotion } from '@/components/launch-motion';
import { NEON } from '@/lib/theme';

// Native timing samples this continuous curve once, before playback. No JS
// frame updates and no three-point velocity changes or overshoot on text.
const SCENE_EASE = Easing.bezier(0.22, 1, 0.36, 1);
type SceneMotion = { arrivals: Animated.Value[]; detail: Animated.Value; halo: Animated.Value };

/** A short, overlapping native sequence. Never holds up navigation or loops. */
export function useSceneMotion(enabled: boolean) {
  const reduce = useLaunchReducedMotion();
  const initial = enabled && !reduce ? 0 : 1;
  const motion = useRef<SceneMotion | null>(null);
  if (!motion.current) motion.current = {
    arrivals: Array.from({ length: 6 }, () => new Animated.Value(initial)),
    detail: new Animated.Value(initial), halo: new Animated.Value(initial),
  };
  const scene = motion.current;
  const played = useRef(false);
  useEffect(() => {
    const finish = () => [...scene.arrivals, scene.detail, scene.halo].forEach(value => value.setValue(1));
    if (!enabled || reduce || played.current || AppState.currentState !== 'active') {
      finish();
      return;
    }
    played.current = true;
    const timing = (value: Animated.Value, delay: number, duration: number, easing = SCENE_EASE) => Animated.timing(value, {
      toValue: 1, duration, delay, easing,
      useNativeDriver: true, isInteraction: false,
    });
    const animation = Animated.parallel([
      ...scene.arrivals.map((value, index) => timing(value, 90 + index * 45, 460)),
      timing(scene.detail, 330, 650),
      timing(scene.halo, 240, 1000, Easing.inOut(Easing.sin)),
    ]);
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { animation.stop(); finish(); }
    });
    animation.start();
    return () => { animation.stop(); subscription.remove(); };
  }, [enabled, reduce, scene]);
  return scene;
}

/** Text stays at its final scale; pins have a small, monotonic approach. */
export function sceneArrival(scene: SceneMotion, index: number, pin = false) {
  const progress = scene.arrivals[index];
  return {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [pin ? 6 : 8, 0] }) },
      { scale: pin ? progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) : 1 },
    ],
  };
}

/** A single location signal, clipped inside the map; invisible at rest. */
export function SceneHalo({ scene, size = 58 }: { scene: SceneMotion; size?: number }) {
  // Parabolic opacity has zero visible opacity at both ends. The sine timing
  // makes its onset/finish gentle, while scale increases without a reversal.
  const opacity = Animated.multiply(scene.halo, Animated.subtract(1, scene.halo));
  return <Animated.View pointerEvents="none" style={{
    position: 'absolute', width: size, height: size, borderRadius: size / 2,
    borderWidth: 1, borderColor: NEON,
    opacity,
    transform: [{ scale: scene.halo.interpolate({ inputRange: [0, 1], outputRange: [0.65, 2.1] }) }],
  }} />;
}
