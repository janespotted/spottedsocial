import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import { NEON } from '@/lib/theme';

export interface SubTab<T extends string> {
  key: T;
  label: string;
  /** A small trailing symbol, e.g. the moon on "Newsfeed" in Day Mode. */
  icon?: SFSymbol;
}

/**
 * The large text tabs under a tab header — Chat's Plans | DMs and Home's
 * Morning After | Newsfeed (Day Mode). The selected one is white with a lime
 * underline; the rest are dimmed. `trailing` sits at the far right (Chat's
 * compose button).
 */
export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
  trailing,
}: {
  tabs: SubTab<T>[];
  value: T;
  onChange: (tab: T) => void;
  trailing?: ReactNode;
}) {
  return (
    <View className="flex-row items-center px-4 pt-2 pb-3" accessibilityRole="tablist">
      {tabs.map((tab) => {
        const selected = value === tab.key;
        const color = selected ? '#ffffff' : 'rgba(255,255,255,0.45)';
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className="mr-6"
          >
            <View className="flex-row items-center gap-1.5">
              <Text className="font-sans-semibold text-2xl" style={{ color }}>
                {tab.label}
              </Text>
              {tab.icon ? <SymbolView name={tab.icon} size={15} tintColor={color} /> : null}
            </View>
            {selected ? <View className="rounded-full mt-0.5" style={{ height: 2.5, backgroundColor: NEON }} /> : null}
          </Pressable>
        );
      })}
      <View className="flex-1" />
      {trailing}
    </View>
  );
}
