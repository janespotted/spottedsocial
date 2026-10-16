import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Avatar } from './avatar';
import type { MapFriend } from '@/hooks/use-map-data';
import { mapPopupLayout } from '@/lib/popup-bounds';
import { INK_LIGHT } from '@/lib/theme';

export function MapFriendsPopup({ people, point, frame, topInset, bottomInset, onClose, onSelect }: {
  people: MapFriend[]; point: { x: number; y: number }; frame: { width: number; height: number };
  topInset: number; bottomInset: number; onClose: () => void; onSelect: (person: MapFriend) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(52 * fontScale);
  const [contentHeight, setContentHeight] = useState(people.length * 64 * fontScale);
  const layout = mapPopupLayout({ ...frame, ...point, topInset, bottomInset,
    desiredHeight: Math.min(440 * fontScale, headerHeight + contentHeight) });
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close friends here" />
    <View pointerEvents="none" style={{ position: 'absolute', left: layout.pointerLeft, top: layout.pointerTop,
      width: 14, height: 14, transform: [{ rotate: '45deg' }], backgroundColor: INK_LIGHT }} />
    <View accessibilityViewIsModal style={{ position: 'absolute', left: layout.left, top: layout.top,
      width: layout.width, height: layout.height, backgroundColor: INK_LIGHT, borderRadius: 18,
      borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1, overflow: 'hidden' }}>
      <View onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)} className="flex-row items-center pl-4 pr-2 py-1">
        <Text className="flex-1 text-white/65 font-sans-medium" style={{ fontSize: 14 }} numberOfLines={2}>
          {people[0]?.venue_name ? `Friends at ${people[0].venue_name}` : 'Friends here'}
        </Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close friends here" className="min-w-11 min-h-11 items-center justify-center">
          <SymbolView name="xmark" size={14} tintColor="white" />
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} onContentSizeChange={(_, h) => setContentHeight(h)} nestedScrollEnabled bounces={false} keyboardShouldPersistTaps="handled">
        {people.map(person => <Pressable key={person.user_id} onPress={() => onSelect(person)} accessibilityRole="button" accessibilityLabel={`Open ${person.display_name}'s profile`} className="flex-row items-center gap-3 px-4 py-3 min-h-14">
          <Avatar name={person.display_name} url={person.avatar_url} size="sm" />
          <Text className="flex-1 text-white font-sans-medium" style={{ fontSize: 14 }} numberOfLines={2}>{person.display_name}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>;
}
