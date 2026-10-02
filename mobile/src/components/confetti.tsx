import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { subscribeConfetti } from '@/lib/confetti';
import { NEON, PURPLE } from '@/lib/theme';

const COLORS = [PURPLE, NEON, '#ffffff'];

interface Particle {
  /** A burst particle flies out radially and slows down; a cannon one is ballistic. */
  burst: boolean;
  x0: number;
  y0: number;
  /** Cannon: velocity (px/s). Burst: the full reach of the particle (px). */
  vx: number;
  vy: number;
  spin: number;
  /** Burst only: how fast the paper flips (rad/s). */
  flip: number;
  size: number;
  color: string;
  delay: number;
  /** Burst only: seconds until fully faded. */
  life: number;
  rect: boolean;
}

/* ── Bursts: the web check-in confirmation's canvas-confetti loop ──
   Every 250 ms a burst from a random point in the left third and one in the
   right third, spread 360°, each smaller than the last. canvas-confetti's
   numbers translated to time: startVelocity 30 (±50 %) with decay 0.9 per
   frame reaches 10 × v px, gravity 3 px per frame drifts down, ticks 60 is
   a one-second life. */
const BURST_WAVES = 7;
const BURST_INTERVAL = 0.25;
const BURST_LIFE = 1;
const BURST_PER_SIDE = 14;
const BURST_DECAY = 6.3; // 1 - e^(-k t) ≈ the 0.9-per-frame decay at 60 fps
const BURST_DRIFT = 180; // px / s
/** Long enough for the last wave to fade. */
export const BURST_DURATION = Math.round(((BURST_WAVES - 1) * BURST_INTERVAL + BURST_LIFE) * 1000) + 100;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function burstParticles(width: number, height: number): Particle[] {
  const out: Particle[] = [];
  for (let wave = 0; wave < BURST_WAVES; wave++) {
    const count = Math.max(2, Math.round(BURST_PER_SIDE * (1 - wave / BURST_WAVES)));
    for (const [lo, hi] of [[0.1, 0.3], [0.7, 0.9]]) {
      const x0 = width * rand(lo, hi);
      const y0 = height * (Math.random() - 0.2);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const reach = 10 * rand(15, 45);
        out.push({
          burst: true,
          x0,
          y0,
          vx: Math.cos(angle) * reach,
          vy: Math.sin(angle) * reach,
          spin: (Math.random() - 0.5) * 540,
          flip: rand(6, 14),
          size: rand(7, 11),
          color: COLORS[(wave + i) % COLORS.length],
          delay: wave * BURST_INTERVAL,
          life: BURST_LIFE,
          rect: Math.random() > 0.35,
        });
      }
    }
  }
  return out;
}

function cannonParticles(count: number, width: number, height: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    const angle = ((fromLeft ? 60 : 120) + (Math.random() - 0.5) * 55) * (Math.PI / 180);
    const speed = 480 + Math.random() * 360; // px per second
    out.push({
      burst: false,
      x0: fromLeft ? -8 : width + 8,
      y0: height * 0.6,
      vx: Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      spin: (Math.random() - 0.5) * 720,
      flip: 0,
      size: 7 + Math.random() * 6,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.6,
      life: 0,
      rect: Math.random() > 0.4,
    });
  }
  return out;
}

/**
 * Brief confetti in Spotted colours. Pure Reanimated: no native module.
 *
 * - `cannons` (default): fired from both sides like the original build's
 *   canvas-confetti cannons (angle 60° / 120° from y = 60 %). The success
 *   cards — "Invites Sent!" and the Meet Up confirmation — never the friend
 *   card (addendum v3 §1).
 * - `bursts`: the web app's check-in celebration. Fired full screen through
 *   `fireConfetti()` (ConfettiHost below) when a user checks in as out.
 */
export function Confetti({
  count = 70,
  duration = 3000,
  variant = 'cannons',
}: {
  count?: number;
  duration?: number;
  variant?: 'cannons' | 'bursts';
}) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration, easing: Easing.linear });
  }, [progress, duration]);

  const particles = useMemo<Particle[]>(
    () => (variant === 'bursts' ? burstParticles(width, height) : cannonParticles(count, width, height)),
    [variant, count, width, height],
  );

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {particles.map((p, i) => (
        <Piece key={i} p={p} progress={progress} duration={duration} />
      ))}
    </View>
  );
}

/**
 * Root-level host for `fireConfetti()`. Draws into a FullWindowOverlay so the
 * celebration covers the whole screen, above the native sheet it was fired
 * from, and keeps playing if that sheet closes. Touches pass straight through.
 */
export function ConfettiHost() {
  const [shots, setShots] = useState<number[]>([]);

  useEffect(
    () =>
      subscribeConfetti((id) => {
        setShots((s) => [...s, id]);
        setTimeout(() => setShots((s) => s.filter((x) => x !== id)), BURST_DURATION);
      }),
    [],
  );

  if (shots.length === 0) return null;
  return (
    <FullWindowOverlay>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {shots.map((id) => (
          <Confetti key={id} variant="bursts" duration={BURST_DURATION} />
        ))}
      </View>
    </FullWindowOverlay>
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
    if (p.burst) {
      const reached = 1 - Math.exp(-BURST_DECAY * t);
      return {
        opacity: t <= 0 ? 0 : Math.max(0, 1 - t / p.life),
        transform: [
          { translateX: p.x0 + p.vx * reached },
          { translateY: p.y0 + p.vy * reached + BURST_DRIFT * t },
          { rotate: `${p.spin * t}deg` },
          { scaleY: Math.cos(p.flip * t) },
        ],
      };
    }
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
