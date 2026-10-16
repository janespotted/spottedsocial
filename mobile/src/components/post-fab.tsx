import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLaunchReducedMotion } from '@/components/launch-motion';
import { popupBounds } from '@/lib/popup-bounds';
import { NEON, INK } from '@/lib/theme';

type PostKind = 'camera' | 'text';
type Anchor = { x: number; y: number; width: number; height: number };

/** One small choice above Post; each choice enters the same draft/publish route. */
export function PostFab() {
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [visible, setVisible] = useState(false);
  const pending = useRef<PostKind | null>(null);
  const measuring = useRef(false);
  const focused = useIsFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useLaunchReducedMotion();
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!focused) { pending.current = null; setVisible(false); }
  }, [focused]);
  // A rotation changes the trigger's coordinates. Reopen from a fresh measurement.
  useEffect(() => { setVisible(false); }, [width, height, fontScale]);
  useEffect(() => () => { focusedRef.current = false; }, []);

  const open = () => {
    if (measuring.current || visible || pending.current) return;
    measuring.current = true;
    trigger.current?.measureInWindow((x, y, w, h) => {
      measuring.current = false;
      if (!focusedRef.current || w <= 0 || h <= 0) return;
      reveal.setValue(reduceMotion ? 1 : 0);
      setAnchor({ x, y, width: w, height: h });
      setVisible(true);
      void Haptics.selectionAsync().catch(() => {});
    });
  };
  const close = () => setVisible(false);
  const presentComposer = () => {
    const kind = pending.current;
    pending.current = null;
    if (kind && focusedRef.current) router.push({ pathname: '/create-post', params: { kind } });
  };
  const choose = (kind: PostKind) => {
    if (pending.current) return;
    pending.current = kind;
    setVisible(false);
  };
  // iOS must finish dismissing its native modal before presenting the composer.
  // Android doesn't emit onDismiss; its React commit removes the menu first.
  useEffect(() => {
    if (!visible && pending.current && Platform.OS !== 'ios') presentComposer();
  }, [visible]);
  const stacked = fontScale > 1.5;
  const bounds = popupBounds({ x: anchor?.x ?? 16, y: anchor?.y ?? height / 2, width, height,
    topInset: insets.top, bottomInset: insets.bottom, desiredWidth: 236,
    desiredHeight: stacked ? 160 + fontScale * 40 : 82 + fontScale * 30 });
  const triggerContent = (expanded: boolean) => <>
    <SymbolView name={expanded ? 'xmark' : 'plus'} size={20} tintColor={INK} weight="semibold" />
    <Text className="text-[15px] font-sans-semibold text-[#1a0f2e]">Post</Text>
  </>;
  const buttonStyle = { backgroundColor: NEON, boxShadow: '0 4px 20px rgba(212,255,0,0.2)' };

  return <>
    <Pressable ref={trigger} onPress={open} accessibilityRole="button" accessibilityLabel="New post"
      accessibilityHint="Choose a photo, video, or text post" accessibilityState={{ expanded: visible }}
      className="absolute left-4 min-h-14 py-3 pl-4 pr-5 rounded-full flex-row items-center gap-2 active:opacity-90"
      style={[buttonStyle, { bottom: insets.bottom + 16 }]}>{triggerContent(false)}</Pressable>
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent
      onRequestClose={close} onDismiss={presentComposer}
      onShow={() => Animated.timing(reveal, { toValue: 1, duration: reduceMotion ? 0 : 180,
        easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()}>
      <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={close}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(11,4,25,0.22)' }]}
          onPress={close} accessibilityRole="button" accessibilityLabel="Dismiss Post menu" />
        {anchor ? <>
          <Animated.View style={{ position: 'absolute', left: bounds.left, width: bounds.width,
            bottom: height - anchor.y + 12, opacity: reveal,
            transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
            borderRadius: 22, backgroundColor: '#38284d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
            boxShadow: '0 10px 26px rgba(0,0,0,0.35)' }}>
            <ScrollView bounces={false} style={{ maxHeight: bounds.maxHeight }} contentContainerStyle={{ padding: 8 }}>
              <View style={{ flexDirection: stacked ? 'column' : 'row' }}>
                {([{ kind: 'camera', icon: 'camera', label: 'Photo/video', accessibility: 'Photo or video' },
                  { kind: 'text', icon: 'square.and.pencil', label: 'Text', accessibility: 'Text post' }] as const).map((option, i) => (
                  <Pressable key={option.kind} onPress={() => choose(option.kind)} accessibilityRole="button"
                    accessibilityLabel={option.accessibility} className="items-center justify-center gap-2 rounded-2xl px-2 py-3 active:bg-white/10"
                    style={{ flex: stacked ? undefined : 1, minHeight: 82,
                      ...(i ? { borderLeftWidth: stacked ? 0 : 1, borderTopWidth: stacked ? 1 : 0, borderColor: 'rgba(255,255,255,0.1)' } : {}) }}>
                    <SymbolView name={option.icon} size={27} tintColor="#ffffff" weight="regular" />
                    <Text className="text-white text-xs font-sans-medium text-center">{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <View pointerEvents="none" style={{ position: 'absolute', bottom: -6, left: Math.max(18, Math.min(bounds.width - 24, anchor.x - bounds.left + anchor.width / 2 - 5)),
              width: 10, height: 10, backgroundColor: '#38284d', transform: [{ rotate: '45deg' }],
              borderRightWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
          </Animated.View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close Post menu" accessibilityState={{ expanded: true }}
            className="pl-4 pr-5 rounded-full flex-row items-center justify-center gap-2 active:opacity-90"
            style={[buttonStyle, { position: 'absolute', left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height }]}>
            {triggerContent(true)}
          </Pressable>
        </> : null}
      </View>
    </Modal>
  </>;
}
