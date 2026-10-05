import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { useNightMode } from '@/hooks/use-night-mode';
import { useSession } from '@/hooks/use-session';
import { getCityLabel } from '@/lib/city-neighborhoods';
import { NIGHT_MODE_KEY, setNightModeOverride, type NightModeKind } from '@/lib/night-mode';
import { buildMyRecapNow, NIGHT_RECAP_KEY } from '@/lib/night-recap';
import { getNightKey } from '@/lib/tonight';
import { control, NEON, primaryControl, primaryControlText } from '@/lib/theme';

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
 * Tester accounts also get the Auto / Day / Night switch here; the server
 * honours it too (DAY-NIGHT-MODE-PLAN.md D8).
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

      {mode.tester ? <TesterSwitch override={mode.override} /> : null}

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

/** Testers only: force Day or Night for this account, on the device and the server. */
function TesterSwitch({ override }: { override: NightModeKind | null }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const current = override ?? 'auto';

  const choose = async (next: NightModeKind | 'auto') => {
    if (saving || next === current) return;
    setSaving(next);
    try {
      const state = await setNightModeOverride(next);
      queryClient.setQueryData([NIGHT_MODE_KEY, session?.user.id], state);
    } catch (e) {
      Alert.alert('Could not switch', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(null);
    }
  };

  // The real recap is built at 5 AM; this previews it from tonight so far.
  const buildRecap = async () => {
    if (saving) return;
    setSaving('recap');
    try {
      await buildMyRecapNow();
      await queryClient.invalidateQueries({ queryKey: [NIGHT_RECAP_KEY] });
      router.back();
      setTimeout(() => router.push('/morning-after'), 350);
    } catch (e) {
      Alert.alert('Could not build the recap', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <View className="gap-2 rounded-2xl border border-dashed border-white/20 p-3">
      <View className="flex-row items-center gap-1.5">
        <SymbolView name="wrench.and.screwdriver" size={12} tintColor="rgba(255,255,255,0.6)" />
        <Text className="text-white/60 text-xs font-sans-medium">Tester · mode for this account</Text>
      </View>
      <Pressable
        onPress={buildRecap}
        disabled={!!saving}
        accessibilityRole="button"
        className={`min-h-10 rounded-full flex-row items-center justify-center gap-2 ${control.ordinary}`}
      >
        {saving === 'recap' ? (
          <ActivityIndicator size="small" color={NEON} />
        ) : (
          <SymbolView name="sunrise" size={13} tintColor="rgba(255,255,255,0.85)" />
        )}
        <Text className="text-white/85 text-sm font-sans-medium">Build my recap from tonight so far</Text>
      </Pressable>
      <View className="flex-row gap-2" accessibilityRole="radiogroup">
        {(['auto', 'day', 'night'] as const).map((option) => {
          const selected = current === option;
          return (
            <Pressable
              key={option}
              onPress={() => choose(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`flex-1 min-h-10 rounded-full items-center justify-center ${selected ? control.selected : control.ordinary}`}
            >
              {saving === option ? (
                <ActivityIndicator size="small" color={NEON} />
              ) : (
                <Text className={`text-sm font-sans-medium ${selected ? 'text-[#d4ff00]' : 'text-white/85'}`}>
                  {option === 'auto' ? 'Auto' : option === 'day' ? 'Day' : 'Night'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
