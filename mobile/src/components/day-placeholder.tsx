import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { INK_LIGHT, NEON, PURPLE, primaryControl, primaryControlText } from '@/lib/theme';

export interface PlaceholderAction {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
}

/**
 * The empty state for Day Mode's surfaces (Tonight's plans, Morning After):
 * a dashed card with a small cluster of Lucide icons — the main one lime in
 * the middle, up to two violet ones tilted beside it — a title naming the
 * situation, one line, and the action that fills it. Never sample content.
 */
export function DayPlaceholder({
  icons,
  title,
  body,
  action,
}: {
  /** [main, left?, right?] */
  icons: [LucideIcon, LucideIcon?, LucideIcon?];
  title: string;
  body?: string;
  action?: PlaceholderAction;
}) {
  const [Main, Left, Right] = icons;
  const ActionIcon = action?.icon;
  return (
    <View
      className="items-center rounded-[22px] border border-dashed border-white/15 bg-white/[0.03] px-5 pt-6 pb-5"
      accessible={!action}
      accessibilityLabel={!action ? [title, body].filter(Boolean).join('. ') : undefined}
    >
      <View className="flex-row items-end justify-center mb-4" importantForAccessibility="no-hide-descendants">
        {Left ? (
          <View
            className="w-10 h-10 rounded-2xl items-center justify-center -mr-2 mb-1 bg-[#2a1840] border border-[#a855f7]/25"
            style={{ transform: [{ rotate: '-12deg' }] }}
          >
            <Left size={18} color={PURPLE} strokeWidth={2} />
          </View>
        ) : null}
        {/* Solid base under the tint so the tilted tiles don't show through */}
        <View className="z-10 rounded-[20px] bg-[#1a0f2e]">
          <View className="w-14 h-14 rounded-[20px] items-center justify-center bg-[#d4ff00]/10 border border-[#d4ff00]/30">
            <Main size={26} color={NEON} strokeWidth={1.9} />
          </View>
        </View>
        {Right ? (
          <View
            className="w-10 h-10 rounded-2xl items-center justify-center -ml-2 mb-1 bg-[#2a1840] border border-[#a855f7]/25"
            style={{ transform: [{ rotate: '12deg' }] }}
          >
            <Right size={18} color={PURPLE} strokeWidth={2} />
          </View>
        ) : null}
      </View>

      <Text className="text-white text-base font-sans-semibold text-center">{title}</Text>
      {body ? <Text className="text-white/60 text-sm font-sans text-center leading-5 mt-1.5 max-w-72">{body}</Text> : null}

      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          className={`flex-row items-center gap-2 min-h-11 px-5 rounded-full mt-4 active:opacity-85 ${primaryControl}`}
        >
          {ActionIcon ? <ActionIcon size={16} color={INK_LIGHT} strokeWidth={2.2} /> : null}
          <Text className={`text-sm font-sans-semibold ${primaryControlText}`}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
