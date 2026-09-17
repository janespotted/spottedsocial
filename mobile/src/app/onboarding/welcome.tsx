import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import BackgroundGeolocation from 'react-native-background-geolocation';
import { ensureLocationReady } from '@/lib/location-ready';
import { useSession } from '@/hooks/use-session';
import { NEON, PURPLE } from '@/lib/theme';

interface Slide {
  icon: SFSymbol;
  title: string;
  description: string;
  color: string;
}

const SLIDES: Slide[] = [
  {
    icon: 'sparkles',
    title: 'Welcome to Spotted',
    description:
      "See which friends are out right now, what venues they're at, and what looks buzzing — instantly.",
    color: NEON,
  },
  {
    icon: 'mappin.and.ellipse',
    title: 'Share Your Location',
    description:
      "Share your live location with close friends, friends, or mutuals so they can link up with you fast — and you're always in control of who sees you.",
    color: PURPLE,
  },
  {
    icon: 'person.2.fill',
    title: 'Send Meet Ups',
    description:
      'Make plans in one tap. Send a meet-up request and your friends get notified instantly — no messy group chats.',
    color: NEON,
  },
  {
    icon: 'camera.fill',
    title: 'Share Your Night',
    description:
      'Post quick updates and stories that disappear by 5am — fun for the night, gone by sunrise.',
    color: PURPLE,
  },
];

export default function WelcomeScreen() {
  const { session, refreshOnboardingStatus } = useSession();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    if (!session || finishing) return;
    setFinishing(true);
    // The slide above explained why; now ask for When In Use only. The
    // background ("Always") upgrade is a separate, explained step offered
    // after the first successful check-in (lib/location-ready.ts).
    // Denial is fine — the app degrades gracefully and the check-in sheet
    // re-checks. Never wait forever on the native prompt.
    try {
      await Promise.race([
        // ready() is configured for When In Use, so this is the standard prompt only
        ensureLocationReady().then(() => BackgroundGeolocation.requestPermission()),
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);
    } catch {
      /* denied or unavailable — continue */
    }
    // Gate in the root layout swaps to (tabs) once status refreshes
    await refreshOnboardingStatus();
  };

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide((s) => s + 1);
    } else {
      finish();
    }
  };

  const slide = SLIDES[currentSlide];
  const isLast = currentSlide === SLIDES.length - 1;

  return (
    <View
      className="flex-1"
      style={{
        experimental_backgroundImage: 'linear-gradient(to bottom, #2d1b4e, #0a0118)',
      }}
    >
      <View className="h-16" />

      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-24 h-24 rounded-full items-center justify-center mb-8"
          style={{
            backgroundColor: `${slide.color}20`,
            boxShadow: `0 0 60px ${slide.color}40`,
          }}
        >
          <SymbolView name={slide.icon} size={48} tintColor={slide.color} />
        </View>

        <Text className="text-3xl font-sans-semibold text-white mb-4 text-center">
          {slide.title}
        </Text>
        <Text className="text-white/70 text-lg font-sans leading-relaxed text-center max-w-sm">
          {slide.description}
        </Text>
      </View>

      <View className="p-8 pb-safe-offset-8 gap-6">
        <View className="flex-row justify-center gap-2">
          {SLIDES.map((_, index) => (
            <Pressable
              key={index}
              onPress={() => setCurrentSlide(index)}
              className={
                index === currentSlide
                  ? 'w-6 h-2 rounded-full bg-[#d4ff00]'
                  : 'w-2 h-2 rounded-full bg-white/30'
              }
            />
          ))}
        </View>

        <Pressable
          onPress={handleNext}
          disabled={finishing}
          className="w-full h-14 rounded-full flex-row items-center justify-center gap-1 active:opacity-90 disabled:opacity-70"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-[#1a0f2e] text-lg font-sans-semibold">
            {finishing ? 'setting up...' : isLast ? "Let's Go!" : 'Next'}
          </Text>
          {!isLast && !finishing ? (
            <SymbolView name="chevron.right" size={16} tintColor="#1a0f2e" />
          ) : null}
        </Pressable>

        <Pressable onPress={finish} disabled={finishing}>
          <Text className="text-center text-white/55 text-sm font-sans">Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
