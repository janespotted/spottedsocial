import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Avatar } from '@/components/avatar';
import { INK_LIGHT, NEON } from '@/lib/theme';

export interface DropdownOption {
  key: string;
  label: string;
  /** Optional avatar rendered before the label (people lists). */
  avatar?: { name: string; url: string | null };
}

/**
 * Spotted-styled dropdown (addendum v3 §8.8): a menu anchored under its
 * trigger, on the app's own surface — not the system action sheet, which
 * the client called out as a generic replacement for the original build's
 * dropdown (web `DropdownMenu`: `bg-[#1a0f2e] border-white/15`, items
 * `hover:bg-white/10`). The trigger is rendered by the caller so the pill
 * keeps its screen-specific styling; the menu measures the trigger and
 * opens beneath it, flipping above when there is no room.
 */
export function DropdownMenu({
  options,
  selectedKey,
  onSelect,
  children,
  accessibilityLabel,
  title,
  maxHeight = 288,
}: {
  options: DropdownOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** The trigger content (pill); pressed state is handled here. */
  children: ReactNode;
  accessibilityLabel: string;
  /** Small heading above the options ("Friends at Le Bain"). */
  title?: string;
  maxHeight?: number;
}) {
  const triggerRef = useRef<View>(null);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const open = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      Haptics.selectionAsync();
      setAnchor({ x, y, w, h });
    });
  };
  const close = () => setAnchor(null);

  // Below the trigger by default; above it when the menu would run off the
  // bottom. Width follows the trigger but never less than a readable menu.
  const menuWidth = Math.max(anchor?.w ?? 0, 200);
  const estimatedHeight = Math.min(maxHeight, options.length * 46 + 12);
  const spaceBelow = anchor ? windowHeight - (anchor.y + anchor.h) - 16 : 0;
  const openAbove = anchor ? spaceBelow < estimatedHeight && anchor.y > estimatedHeight : false;
  const left = anchor ? Math.min(anchor.x, windowWidth - menuWidth - 12) : 0;
  const top = anchor ? (openAbove ? anchor.y - estimatedHeight - 6 : anchor.y + anchor.h + 6) : 0;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: !!anchor }}
      >
        {children}
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close}>
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close menu">
          {anchor ? (
            <Animated.View
              entering={FadeIn.duration(120)}
              exiting={FadeOut.duration(100)}
              className="absolute rounded-2xl border border-white/15 overflow-hidden"
              style={{
                left,
                top,
                width: menuWidth,
                maxHeight,
                backgroundColor: INK_LIGHT,
                shadowColor: '#000',
                shadowOpacity: 0.45,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
              }}
            >
              <ScrollView bounces={false} contentContainerClassName="py-1.5">
                {title ? (
                  <Text className="text-white/45 text-[10px] font-sans-medium uppercase tracking-wider px-4 pt-1.5 pb-1">
                    {title}
                  </Text>
                ) : null}
                {options.map((option) => {
                  const selected = option.key === selectedKey;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        close();
                        onSelect(option.key);
                      }}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected }}
                      className="flex-row items-center gap-3 px-4 py-3 active:bg-white/10"
                    >
                      {option.avatar ? (
                        <Avatar name={option.avatar.name} url={option.avatar.url} size="sm" />
                      ) : null}
                      <Text
                        className={`flex-1 text-sm ${selected ? 'font-sans-semibold' : 'font-sans-medium'}`}
                        style={{ color: selected ? NEON : '#ffffff' }}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                      {selected ? <SymbolView name="checkmark" size={13} tintColor={NEON} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
