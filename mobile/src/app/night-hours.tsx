import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useNightMode } from '@/hooks/use-night-mode';
import { getCityLabel } from '@/lib/city-neighborhoods';
import { getNightKey } from '@/lib/tonight';
import { primaryControl, primaryControlText } from '@/lib/theme';

/** The schedule as the client wrote it; weekdays are the night's date (0 = Sunday). */
const ROWS: { label: string; time: string; days: number[] }[] = [
  { label: 'Monday – Thursday', time: '6 PM', days: [1, 2, 3, 4] },
  { label: 'Friday', time: '4 PM', days: [5] },
  { label: 'Saturday', time: '12 PM', days: [6] },
  { label: 'Sunday', time: '3 PM', days: [0] },
];

/**
 * When Night Mode opens (client brief §6), opened from the Day pill and the
 * Home countdown. A `fitToContents` form sheet, so it holds no scroll view.
 * (Tester tools — Auto / Day / Night, enforcement, recap preview — live in
 * Settings.)
 */
export default function NightHoursSheet() {
  const mode = useNightMode();
  const [year, month, day] = getNightKey(new Date(), mode.city).split('-').map(Number);
  const tonight = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  const openComposer = () => {
    router.back();
    setTimeout(() => router.push('/create-plan'), 350);
  };

  return (
    <View className="pt-6 pb-safe-offset-4 px-5 gap-4">
      <View className="gap-1">
        <Text className="text-white text-xl font-sans-semibold">
          {mode.isNight ? 'Night Mode is live.' : 'When tonight goes live.'}
        </Text>
        <Text className="text-white/60 text-sm font-sans">
          {mode.isNight
            ? 'Until 5 AM. Opening times are local to '
            : 'Opening times are local to '}
          {getCityLabel(mode.city)}.
        </Text>
      </View>

      <View>
        {ROWS.map((row) => {
          const isTonight = row.days.includes(tonight);
          return (
            <View
              key={row.label}
              className="flex-row items-center justify-between min-h-12 border-b border-white/10"
              accessibilityLabel={`${row.label}, ${row.time}${isTonight ? ', tonight' : ''}`}
            >
              <Text className={`text-[15px] font-sans ${isTonight ? 'text-[#d4ff00]' : 'text-white'}`}>
                {row.label}
                {isTonight ? '  · Tonight' : ''}
              </Text>
              <Text className={`text-[15px] font-sans-semibold ${isTonight ? 'text-[#d4ff00]' : 'text-white'}`}>
                {row.time}
              </Text>
            </View>
          );
        })}
      </View>

      <Text className="text-white/60 text-sm font-sans leading-5">
        Live map, In / TBD / Out, venue heat and check-ins start with Night Mode. Send a Meet Up or venue invite
        when you&apos;re ready to meet now. Plans and messages work all day.
      </Text>

      <Pressable
        onPress={openComposer}
        accessibilityRole="button"
        className={`min-h-12 rounded-full items-center justify-center active:opacity-85 ${primaryControl}`}
      >
        <Text className={`text-[15px] font-sans-semibold ${primaryControlText}`}>Make a plan</Text>
      </Pressable>
    </View>
  );
}
