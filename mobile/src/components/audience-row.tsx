import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ChevronRight, Eye } from 'lucide-react-native';
import { audienceLabel, openAudiencePicker, type Audience } from '@/lib/audience';

/**
 * Compact "Visible to Friends ▾" row. Tapping opens the shared
 * "Who can see this?" sheet; confirming there calls onChange and returns
 * here — it never publishes on its own.
 */
export function AudienceRow({
  value,
  onChange,
  context = 'status',
  compact = false,
  live = false,
  flat = false,
}: {
  value: Audience;
  onChange: (a: Audience) => void | Promise<void>;
  live?: boolean;
  context?: 'status' | 'post';
  compact?: boolean;
  /** Borderless list row with a hairline above — the status sheet's style. */
  flat?: boolean;
}) {
  const label = audienceLabel(value);
  if (flat) {
    return (
      <Pressable
        onPress={() => openAudiencePicker({ value, context, live, onConfirm: onChange })}
        accessibilityRole="button"
        accessibilityLabel={`Visible to ${label}. Change audience`}
        className="flex-row items-center gap-2.5 min-h-12 py-3 border-t border-white/10 active:opacity-70"
      >
        <Eye size={18} color="rgba(255,255,255,0.6)" />
        <Text className="text-white/60 text-sm font-sans flex-1">Visible to</Text>
        <Text className="text-white text-sm font-sans-medium">{label}</Text>
        <ChevronRight size={16} color="rgba(255,255,255,0.6)" />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => openAudiencePicker({ value, context, live, onConfirm: onChange })}
      accessibilityRole="button"
      accessibilityLabel={`Visible to ${label}. Change audience`}
      className={`flex-row items-center gap-2 rounded-xl bg-[#2d1b4e]/50 border border-white/[0.06] active:bg-white/5 ${
        compact ? 'px-3 py-2 self-start' : 'px-4 py-3'
      }`}
    >
      <SymbolView name="eye" size={14} tintColor="rgba(255,255,255,0.5)" />
      <Text className="text-white/60 text-sm font-sans">Visible to</Text>
      <Text className={`text-white text-sm font-sans-semibold ${compact ? '' : 'flex-1'}`}>{label}</Text>
      <SymbolView name="chevron.down" size={12} tintColor="rgba(255,255,255,0.4)" />
    </Pressable>
  );
}
