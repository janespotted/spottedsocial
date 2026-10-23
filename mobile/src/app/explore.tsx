import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { VenueDiscovery } from '@/components/venue-discovery';

export default function ExploreScreen() {
  return <View className="flex-1 pt-safe">
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="flex-row items-center gap-2 self-start min-h-11 px-5">
      <SymbolView name="chevron.left" size={18} tintColor="#ffffff" /><Text className="text-white text-sm font-sans">Back</Text>
    </Pressable>
    <VenueDiscovery standalone />
  </View>;
}
