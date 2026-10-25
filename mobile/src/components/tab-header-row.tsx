import type { ReactNode } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { HeaderActions } from './header-actions';

/** Keep every action visible when text grows; the brand is a logo, not body copy. */
export function TabHeaderRow({ city, unreadCount, inset = true, actions }: {
  city?: string | null; unreadCount: number; inset?: boolean; actions?: ReactNode;
}) {
  const { fontScale, width } = useWindowDimensions();
  const stacked = fontScale > 1.2 || width < 375;
  return <View key={fontScale} className={`${inset ? 'px-4' : ''} min-h-11 gap-2 ${stacked ? 'py-1' : 'flex-row items-center justify-between'}`}>
    <View className={`flex-row items-center gap-2 ${stacked ? 'justify-between' : 'flex-1 min-w-0'}`}>
      <Text className="text-white font-sans-light shrink" numberOfLines={1} maxFontSizeMultiplier={1.3}
        style={{ fontSize: 20, letterSpacing: 5.6 }}>Spotted</Text>
      {city ? <View className="px-2.5 py-1 rounded-full bg-white/10"><Text className="text-white/70 text-xs font-sans-medium uppercase">{city}</Text></View> : null}
    </View>
    <View className={stacked ? 'self-end' : undefined}>{actions ?? <HeaderActions unreadCount={unreadCount} />}</View>
  </View>;
}
