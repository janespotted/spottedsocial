import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Avatar } from './avatar';
import type { MapFriend } from '@/hooks/use-map-data';
import { popupBounds } from '@/lib/popup-bounds';
import { INK_LIGHT } from '@/lib/theme';

/** Mapbox projects the coordinate; native MarkerView measurement is not screen-relative. */
export function MapFriendsPopup({ people, point, onClose, onSelect }: {
  people: MapFriend[]; point: { x: number; y: number }; onClose: () => void; onSelect: (person: MapFriend) => void;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const anchorY = point.y - 40;
  const bounds = popupBounds({ x: point.x - 150, y: anchorY, width, height, topInset: insets.top,
    bottomInset: insets.bottom, desiredHeight: Math.min(440, height * 0.6) });
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close friends here" />
    <View accessibilityViewIsModal style={{ position: 'absolute', left: bounds.left, width: bounds.width,
      bottom: height - anchorY + 8, maxHeight: bounds.maxHeight, backgroundColor: INK_LIGHT, borderRadius: 18,
      borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, overflow: 'hidden' }}>
      <View className="flex-row items-center pl-4 pr-2"><Text className="flex-1 text-white/65 text-xs font-sans-medium" numberOfLines={2}>
        {people[0]?.venue_name ? `Friends at ${people[0].venue_name}` : 'Friends here'}
      </Text><Pressable onPress={onClose} accessibilityLabel="Close friends here" className="min-w-11 min-h-11 items-center justify-center"><SymbolView name="xmark" size={14} tintColor="white" /></Pressable></View>
      <ScrollView style={{ maxHeight: Math.max(44, bounds.maxHeight - 44 * fontScale), flexGrow: 0 }} nestedScrollEnabled bounces={false} keyboardShouldPersistTaps="handled">
        {people.map(person => <Pressable key={person.user_id} onPress={() => onSelect(person)} accessibilityRole="button" accessibilityLabel={`Open ${person.display_name}'s profile`} className="flex-row items-center gap-3 px-4 py-3 min-h-14">
          <Avatar name={person.display_name} url={person.avatar_url} size="sm" />
          <Text className="flex-1 text-white text-sm font-sans-medium" numberOfLines={2}>{person.display_name}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
    <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(bounds.left + 18, Math.min(point.x - 7, bounds.left + bounds.width - 25)), top: anchorY - 8,
      width: 14, height: 14, transform: [{ rotate: '45deg' }], backgroundColor: INK_LIGHT }} />
  </View>;
}
