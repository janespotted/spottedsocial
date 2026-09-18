import { useEffect, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { NEON, PURPLE } from '@/lib/theme';

const COLORS = [PURPLE, NEON, '#ffffff'];

interface Particle {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  spin: number;
  size: number;
  color: string;
  delay: number;
  rect: boolean;
}

/**
 * Brief confetti in Spotted colours, fired from both sides like the original
 * build's canvas-confetti cannons (angle 60° / 120° from y = 60 %). Used only
 * on success cards — "Invites Sent!" and the Meet Up confirmation — never on
 * the friend card (addendum v3 §1). Pure Reanimated: no native module.
 */
export function Confetti({ count = 70, duration = 3000 }: { count?: number; duration?: number }) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration, easing: Easing.linear });
  }, [progress, duration]);

  const particles = useMemo<Particle[]>(() => {
    const out: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0;
      const angle = ((fromLeft ? 60 : 120) + (Math.random() - 0.5) * 55) * (Math.PI / 180);
      const speed = 480 + Math.random() * 360; // px per second
      out.push({
        x0: fromLeft ? -8 : width + 8,
        y0: height * 0.6,
        vx: Math.cos(angle) * speed,
        vy: -Math.sin(angle) * speed,
        spin: (Math.random() - 0.5) * 720,
        size: 7 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.6,
        rect: Math.random() > 0.4,
      });
    }
    return out;
  }, [count, width, height]);

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <Piece key={i} p={p} progress={progress} duration={duration} />
      ))}
    </View>
  );
}

const GRAVITY = 900; // px / s²

function Piece({
  p,
  progress,
  duration,
}: {
  p: Particle;
  progress: SharedValue<number>;
  duration: number;
}) {
  const style = useAnimatedStyle(() => {
    const total = duration / 1000;
    const t = Math.max(0, progress.value * total - p.delay);
    const x = p.x0 + p.vx * t;
    const y = p.y0 + p.vy * t + 0.5 * GRAVITY * t * t;
    const life = total - p.delay;
    const fade = life > 0 ? Math.min(1, Math.max(0, (life - t) / 0.6)) : 0;
    return {
      opacity: t <= 0 ? 0 : fade,
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${p.spin * t}deg` }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: p.size,
          height: p.rect ? p.size * 0.55 : p.size,
          borderRadius: p.rect ? 1 : p.size / 2,
          backgroundColor: p.color,
        },
        style,
      ]}
    />
  );
}
