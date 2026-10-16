import { createContext, useContext, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Portal, PortalHost } from 'react-native-teleport';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Avatar } from '@/components/avatar';
import { INK_LIGHT, NEON } from '@/lib/theme';

type MenuSurface = { ref: RefObject<View | null>; name: string; width: number; height: number };
const MenuSurfaceContext = createContext<MenuSurface | null>(null);

/** Keep a sheet's trigger and overlay in the same native coordinate space. */
export function DropdownMenuSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<View>(null);
  const name = useId();
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <MenuSurfaceContext.Provider value={{ ref, name, ...size }}>
      <View ref={ref} style={style} collapsable={false} onLayout={({ nativeEvent }) => setSize(nativeEvent.layout)}>
        {children}
        <PortalHost name={name} style={StyleSheet.absoluteFill} />
      </View>
    </MenuSurfaceContext.Provider>
  );
}

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
  const surface = useContext(MenuSurfaceContext);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const open = () => {
    const measured = (x: number, y: number, w: number, h: number) => {
      Haptics.selectionAsync();
      setAnchor({ x, y, w, h });
    };
    if (surface?.ref.current) {
      triggerRef.current?.measureLayout(surface.ref.current, measured, () => {});
    } else {
      triggerRef.current?.measureInWindow(measured);
    }
  };
  const close = () => setAnchor(null);

  // Below the trigger by default; above it when the menu would run off the
  // bottom. Width follows the trigger but never less than a readable menu.
  const height = surface?.height || windowHeight;
  const width = surface?.width || windowWidth;
  const menuWidth = Math.min(Math.max(anchor?.w ?? 0, 200), width - 24);
  const estimatedHeight = Math.min(maxHeight, options.length * 46 + 12 + (title ? 28 : 0));
  const spaceBelow = anchor ? height - (anchor.y + anchor.h) - 12 : 0;
  const spaceAbove = anchor ? anchor.y - 12 : 0;
  const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const availableHeight = Math.max(0, Math.min(estimatedHeight, (openAbove ? spaceAbove : spaceBelow) - 6));
  const left = anchor ? Math.max(12, Math.min(anchor.x, width - menuWidth - 12)) : 12;
  const top = anchor ? (openAbove ? anchor.y - availableHeight - 6 : anchor.y + anchor.h + 6) : 0;

  const menu = (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
      {anchor ? (
        <Animated.View
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(100)}
          className="absolute rounded-2xl border border-white/15 overflow-hidden"
          style={{
            left,
            top,
            width: menuWidth,
            maxHeight: availableHeight,
            backgroundColor: INK_LIGHT,
            shadowColor: '#000',
            shadowOpacity: 0.45,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 8 },
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerClassName="py-1.5">
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
                    className={`flex-1 ${selected ? 'font-sans-semibold' : 'font-sans-medium'}`}
                    style={{ fontSize: 14, color: selected ? NEON : '#ffffff' }}
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
    </View>
  );

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
      {surface ? (
        anchor ? <Portal hostName={surface.name}>{menu}</Portal> : null
      ) : (
        <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close}>{menu}</Modal>
      )}
    </>
  );
}
