import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import {
  AUDIENCE_OPTIONS,
  clearAudienceRequest,
  useAudienceRequest,
  type Audience,
} from '@/lib/audience';
import { useSession } from '@/hooks/use-session';
import { audienceIsEmpty, useAudienceCounts } from '@/hooks/use-audience-counts';

const NEON = '#d4ff00';

const EMPTY_HINTS: Record<Audience, string> = {
  close_friends: 'Nobody is on your Close Friends list yet. Star friends to add them.',
  all_friends: "You haven't added any friends yet, so nobody would see this.",
  mutual_friends: "You haven't added any friends yet, so nobody would see this.",
};

/**
 * "Who can see this?" — the one audience selector for check-ins, TBD statuses
 * and posts. Native form sheet opened via openAudiencePicker(); Confirm hands
 * the choice back to the caller and returns to its setup. It never publishes.
 */
export default function AudienceSheet() {
  const { session } = useSession();
  const request = useAudienceRequest();
  const [value, setValue] = useState<Audience>(request?.value ?? 'all_friends');
  const { data: counts } = useAudienceCounts(session?.user.id);

  // Clear the request when the sheet goes away for any reason (swipe, confirm)
  useEffect(() => () => clearAudienceRequest(), []);

  const confirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    request?.onConfirm(value);
    router.back();
  };

  const selectedEmpty = audienceIsEmpty(counts, value);

  return (
    <View className="px-5 pt-6 pb-8 gap-4">
      <Text className="text-white text-xl font-sans-semibold">Who can see this?</Text>

      <View className="rounded-2xl bg-[#2d1b4e]/50 border border-white/[0.06] overflow-hidden">
        {AUDIENCE_OPTIONS.map((opt, i) => {
          const selected = opt.value === value;
          const empty = audienceIsEmpty(counts, opt.value);
          return (
            <Pressable
              key={opt.value}
              onPress={() => setValue(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-white/5 ${
                i > 0 ? 'border-t border-white/[0.06]' : ''
              } ${selected ? 'bg-[#a855f7]/15' : ''}`}
            >
              <View className="flex-1 gap-0.5">
                <Text
                  className={`text-base ${
                    selected ? 'text-[#d4ff00] font-sans-semibold' : 'text-white font-sans-medium'
                  }`}
                >
                  {opt.label}
                  {counts ? (
                    <Text className="text-white/35 font-sans text-sm">  · {counts[opt.value]}</Text>
                  ) : null}
                </Text>
                <Text className="text-white/50 text-xs font-sans">{opt.desc}</Text>
                {empty ? (
                  <Text className="text-amber-400/90 text-xs font-sans mt-0.5">Nobody in this audience yet</Text>
                ) : null}
              </View>
              <View
                className={`w-6 h-6 rounded-full items-center justify-center border ${
                  selected ? 'border-[#d4ff00] bg-[#d4ff00]' : 'border-white/25'
                }`}
              >
                {selected ? <SymbolView name="checkmark" size={12} tintColor="#1a0f2e" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {selectedEmpty ? (
        <View className="flex-row items-start gap-2 rounded-xl px-3 py-2.5 bg-amber-400/10 border border-amber-400/25">
          <SymbolView name="exclamationmark.triangle" size={14} tintColor="#fbbf24" />
          <Text className="text-amber-200/90 text-xs font-sans flex-1">{EMPTY_HINTS[value]}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={confirm}
        className="rounded-full py-3.5 items-center active:opacity-90"
        style={{ backgroundColor: NEON, boxShadow: '0 0 16px rgba(212,255,0,0.25)' }}
      >
        <Text className="text-[#1a0f2e] text-base font-sans-semibold">Confirm audience</Text>
      </Pressable>
      <Text className="text-white/30 text-xs font-sans text-center">
        Confirming only sets the audience — nothing is shared until you do.
      </Text>
    </View>
  );
}
