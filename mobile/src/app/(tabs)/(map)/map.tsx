import { Text, View } from 'react-native';

export default function MapScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <Text className="text-foreground text-lg font-semibold">Map</Text>
      <Text className="text-muted text-sm text-center px-8">
        Native Mapbox map lands here — requires a dev-client build (not Expo Go).
      </Text>
    </View>
  );
}
