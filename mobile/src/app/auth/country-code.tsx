import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import {
  clearCountryRequest,
  flagFor,
  isSupported,
  searchCountries,
  SUPPORTED_COUNT,
  useCountryPickerRequest,
  type Country,
} from '@/lib/country-codes';
import { NEON } from '@/lib/theme';

const MAX_ROWS = 7;

/**
 * Country dialling code picker for the sign-in phone field. Opened with
 * openCountryPicker(); picking a row hands it back and dismisses.
 *
 * Spotted is US-only today, so every country outside SUPPORTED_COUNTRIES is
 * shown dimmed and does not respond to a tap — the list answers "is my
 * country here?" instead of hiding the answer.
 *
 * Like every fitToContents sheet here it holds NO scroll view (a nested
 * scroller breaks the sheet's one-shot content measurement) — the list is
 * capped at MAX_ROWS and search narrows it.
 */
export default function CountryCodeSheet() {
  const request = useCountryPickerRequest();
  const [term, setTerm] = useState('');

  const matches = useMemo(() => searchCountries(term), [term]);
  const visible = matches.slice(0, MAX_ROWS);
  const hiddenCount = Math.max(0, matches.length - visible.length);
  // The supported block only reads as a group while the full list shows.
  const dividerAt = term.trim() ? -1 : SUPPORTED_COUNT;

  const choose = (country: Country) => {
    if (!isSupported(country.code)) return;
    Haptics.selectionAsync();
    request?.onSelect(country);
    clearCountryRequest();
    router.back();
  };

  const cancel = () => {
    clearCountryRequest();
    router.back();
  };

  return (
    <View className="pt-4 pb-safe-offset-4 gap-3">
      <View className="flex-row items-center justify-between px-5">
        <Pressable onPress={cancel} hitSlop={8}>
          <Text className="text-white/60 text-sm font-sans">Cancel</Text>
        </Pressable>
        <Text className="text-white text-base font-sans-semibold">Country code</Text>
        {/* Balances the Cancel label so the title stays centred. */}
        <View className="w-12" />
      </View>

      {/* Says up front why everything below the US is greyed out. */}
      <View className="mx-5 flex-row items-start gap-2 rounded-xl px-3 py-2.5 bg-[#a855f7]/10 border border-[#a855f7]/25">
        <SymbolView name="info.circle" size={14} tintColor="#c4a0f5" />
        <Text className="text-white/70 text-xs font-sans flex-1">
          Spotted is only in the US right now, so US numbers (+1) are the only
          ones we can text a code to. Other countries are coming as we launch
          in more cities.
        </Text>
      </View>

      <View className="px-5">
        <View className="flex-row items-center gap-2 rounded-2xl bg-white/5 border border-white/15 px-3">
          <SymbolView name="magnifyingglass" size={14} tintColor="rgba(255,255,255,0.4)" />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search country or code"
            placeholderTextColorClassName="accent-white/30"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            className="flex-1 h-10 py-0 text-white text-[15px] font-sans"
          />
        </View>
      </View>

      <View className="px-5 pb-1 gap-1">
        {visible.length === 0 ? (
          <Text className="text-white/55 text-sm font-sans text-center py-10">
            No country matches that.
          </Text>
        ) : (
          visible.map((c, i) => {
            const available = isSupported(c.code);
            const selected = available && c.code === request?.selected;
            return (
              <Pressable
                key={c.code}
                onPress={() => choose(c)}
                disabled={!available}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !available }}
                accessibilityLabel={
                  available
                    ? `${c.name} ${c.dial}`
                    : `${c.name} ${c.dial}, not available yet`
                }
                className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl ${
                  available ? 'active:bg-white/5' : 'opacity-40'
                } ${selected ? 'bg-[#d4ff00]/8' : ''} ${
                  i === dividerAt ? 'border-t border-white/8' : ''
                }`}
              >
                <Text className="text-[22px]">{flagFor(c.code)}</Text>
                <Text
                  className={`flex-1 text-[15px] ${
                    selected ? 'text-[#d4ff00] font-sans-semibold' : 'text-white font-sans-medium'
                  }`}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
                <Text className="text-white/55 text-[15px] font-sans">{c.dial}</Text>
                {selected ? (
                  <SymbolView name="checkmark" size={13} tintColor={NEON} weight="bold" />
                ) : (
                  <View className="w-3.25" />
                )}
              </Pressable>
            );
          })
        )}
      </View>

      {hiddenCount > 0 ? (
        <Text className="text-white/45 text-xs font-sans px-5">
          {hiddenCount} more — search to narrow the list.
        </Text>
      ) : null}
    </View>
  );
}
