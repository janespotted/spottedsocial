import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/use-session';
import { ProgressDots } from '@/components/progress-dots';

const NEON = '#d4ff00';

// Everything city-scoped (leaderboard, map camera, venue search, plan feeds)
// keys off profiles.city — without this step new users silently land in NYC.
// (Generated types call it home_city; the LIVE column is `city` — hence the cast.)
const CITIES: { id: string; label: string; sublabel: string }[] = [
  { id: 'nyc', label: 'New York', sublabel: 'Manhattan + Brooklyn + Queens' },
  { id: 'la', label: 'Los Angeles', sublabel: 'WeHo + Hollywood + Downtown' },
  { id: 'pb', label: 'Palm Beach', sublabel: 'Worth Ave + Clematis + CityPlace' },
];

export default function CityScreen() {
  const { session } = useSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!selected || !session || loading) return;
    setLoading(true);
    setError(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({ city: selected } as never)
      .eq('id', session.user.id);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/onboarding/welcome');
  };

  return (
    <View className="flex-1 bg-[#110a24] px-6 pt-safe-offset-5 pb-safe-offset-6">
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        className="absolute left-4 top-safe-offset-5 p-2 z-10"
      >
        <SymbolView name="arrow.left" size={20} tintColor="rgba(255,255,255,0.6)" />
      </Pressable>

      <ProgressDots current={4} total={5} />

      <View className="mt-12 mb-10">
        <Text className="text-[28px] font-sans-light text-white leading-tight">
          where do you go out?
        </Text>
        <Text className="text-sm text-white/40 font-sans mt-2">
          your leaderboard, map, and venues are all local. you can switch cities later.
        </Text>
      </View>

      <View className="gap-3">
        {CITIES.map((city) => {
          const isSelected = selected === city.id;
          return (
            <Pressable
              key={city.id}
              onPress={() => setSelected(city.id)}
              className="flex-row items-center justify-between rounded-2xl border px-5 py-4 active:opacity-80"
              style={{
                borderColor: isSelected ? NEON : 'rgba(255,255,255,0.12)',
                backgroundColor: isSelected ? 'rgba(212,255,0,0.08)' : 'rgba(255,255,255,0.03)',
              }}
            >
              <View>
                <Text className="text-lg font-sans-medium text-white">{city.label}</Text>
                <Text className="text-xs text-white/40 font-sans mt-0.5">{city.sublabel}</Text>
              </View>
              {isSelected ? <SymbolView name="checkmark.circle.fill" size={22} tintColor={NEON} /> : null}
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text selectable className="text-sm text-red-400 font-sans mt-4">
          {error}
        </Text>
      ) : null}

      <View className="mt-auto pt-8">
        <Pressable
          onPress={handleContinue}
          disabled={loading || !selected}
          className="w-full h-12 rounded-2xl items-center justify-center active:opacity-90 disabled:opacity-30"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-black text-base font-sans-semibold">
            {loading ? 'saving...' : 'continue'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
