import { Pressable, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { NEON, control, controlTint, type ControlState } from '@/lib/theme';

/**
 * Round icon control used in headers and floating map controls. One look
 * for every state (client feedback §6): ordinary is quiet, selected is the
 * single neon treatment, disabled is dimmed. `badge` shows an unread count
 * or, with `true`, a dot meaning "something is set here".
 */
export function IconButton({
  icon,
  label,
  onPress,
  state = 'ordinary',
  badge,
  size = 36,
  iconSize,
  weight,
}: {
  icon: SFSymbol;
  /** Accessibility label — every icon-only control must say what it does. */
  label: string;
  onPress: () => void;
  state?: ControlState;
  badge?: number | boolean;
  size?: number;
  iconSize?: number;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}) {
  const disabled = state === 'disabled';
  const count = typeof badge === 'number' ? badge : 0;
  const dot = badge === true;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count} unread` : label}
      accessibilityState={{ disabled, selected: state === 'selected' }}
      className={`rounded-full items-center justify-center active:opacity-70 ${control[state]}`}
      style={{ width: size, height: size }}
    >
      <SymbolView name={icon} size={iconSize ?? Math.round(size * 0.5)} tintColor={controlTint[state]} weight={weight} />
      {count > 0 ? (
        <View
          className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full items-center justify-center"
          style={{ backgroundColor: NEON }}
        >
          <Text className="text-[#1a0f2e] text-[9px] font-sans-bold">{count > 9 ? '9+' : count}</Text>
        </View>
      ) : dot ? (
        <View
          className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#1a0f2e]"
          style={{ backgroundColor: NEON }}
        />
      ) : null}
    </Pressable>
  );
}
