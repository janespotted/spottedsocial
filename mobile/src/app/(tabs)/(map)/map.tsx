import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Mapbox, {
  Camera,
  CircleLayer,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
} from '@rnmapbox/maps';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CITY_CENTERS } from '@/lib/city-neighborhoods';
import { useSession } from '@/hooks/use-session';
import { useNotifications } from '@/hooks/use-notifications';
import { useMapData, type MapFriend } from '@/hooks/use-map-data';
import { Avatar } from '@/components/avatar';
import { FriendIdCard } from '@/components/friend-id-card';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? null);

const PURPLE = '#a855f7';

// Relationship ring colors — must match the legend (web map parity)
const RELATIONSHIP_COLORS: Record<string, string> = {
  close: '#d4ff00',
  direct: '#9333ea',
  mutual: '#6366f1',
};

/** Soft expanding pulse behind close-friend markers (web self-marker pulse) */
function PulseRing({ color }: { color: string }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.35);
  useEffect(() => {
    scale.value = withRepeat(withTiming(2, { duration: 2000 }), -1);
    opacity.value = withRepeat(withTiming(0, { duration: 2000 }), -1);
  }, [scale, opacity]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute inset-0 rounded-full"
      style={[{ backgroundColor: color }, style]}
    />
  );
}

function FriendMarker({
  friend,
  index,
  onPress,
}: {
  friend: MapFriend;
  index: number;
  onPress: (friend: MapFriend) => void;
}) {
  const ring = RELATIONSHIP_COLORS[friend.relationshipType] ?? RELATIONSHIP_COLORS.direct;
  return (
    <MarkerView coordinate={[friend.lng, friend.lat]} allowOverlap>
      <Animated.View entering={ZoomIn.springify().damping(14).delay(index * 60)}>
        {friend.relationshipType === 'close' ? <PulseRing color={ring} /> : null}
        <Pressable onPress={() => onPress(friend)} hitSlop={6}>
          <View
            className="rounded-full p-px"
            style={{
              borderWidth: 3,
              borderColor: ring,
              boxShadow: `0 0 8px ${ring}66`,
            }}
          >
            <Avatar name={friend.display_name} url={friend.avatar_url} size="sm" />
          </View>
        </Pressable>
      </Animated.View>
    </MarkerView>
  );
}

export default function MapScreen() {
  const { session } = useSession();
  const { unreadCount } = useNotifications();
  const cameraRef = useRef<Camera>(null);

  const { data: city } = useQuery({
    queryKey: ['home-city', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('home_city')
        .eq('id', session!.user.id)
        .maybeSingle();
      return data?.home_city ?? 'nyc';
    },
  });

  const { data } = useMapData(city ?? null);
  const friends = data?.friends ?? [];
  const venues = data?.venues ?? [];
  const [selectedFriend, setSelectedFriend] = useState<MapFriend | null>(null);
  const [friendCardOpen, setFriendCardOpen] = useState(false);

  const center = CITY_CENTERS[city ?? 'nyc'] ?? CITY_CENTERS.nyc;

  const venueGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: venues.map((v) => ({
      type: 'Feature',
      id: v.id,
      geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
      properties: { venueId: v.id, name: v.name },
    })),
  };

  const handleVenuePress = async (event: { features?: GeoJSON.Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const props = feature.properties as Record<string, any> | null;
    if (props?.cluster) {
      // Zoom into the cluster
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      const currentZoom = await mapRef.current?.getZoom();
      cameraRef.current?.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: Math.min((currentZoom ?? 13) + 2, 17),
        animationDuration: 500,
      });
      return;
    }
    if (props?.venueId) {
      // Fly toward the venue as the page opens (web flyTo parity)
      const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
      cameraRef.current?.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: 15,
        animationDuration: 800,
      });
      router.push({ pathname: '/venue', params: { venueId: props.venueId } });
    }
  };

  const mapRef = useRef<MapView>(null);

  // Web parity: clicking a person flies to them (zoom 15, 1.5s) + opens card
  const handleFriendPress = (friend: MapFriend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cameraRef.current?.setCamera({
      centerCoordinate: [friend.lng, friend.lat],
      zoomLevel: 15,
      animationDuration: 1200,
    });
    setSelectedFriend(friend);
    setFriendCardOpen(true);
  };

  const openVenueByName = async (venueName: string) => {
    const { data: venue } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .maybeSingle();
    if (venue?.id) {
      setFriendCardOpen(false);
      router.push({ pathname: '/venue', params: { venueId: venue.id } });
    }
  };

  const recenter = () => {
    cameraRef.current?.setCamera({
      centerCoordinate: [center.lng, center.lat],
      zoomLevel: 13,
      animationDuration: 800,
    });
  };

  return (
    <View className="flex-1 bg-[#110a24]">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        styleURL="mapbox://styles/mapbox/dark-v11"
        logoEnabled={false}
        attributionPosition={{ bottom: 100, left: 8 }}
        scaleBarEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [center.lng, center.lat], zoomLevel: 13 }}
        />

        {/* Venue dots + clusters — muted purple so friends dominate */}
        <ShapeSource
          id="venues"
          shape={venueGeoJSON}
          cluster
          clusterRadius={50}
          onPress={handleVenuePress}
        >
          <CircleLayer
            id="venue-clusters"
            filter={['has', 'point_count']}
            style={{
              circleColor: 'rgba(168, 85, 247, 0.6)',
              circleRadius: ['step', ['get', 'point_count'], 12, 10, 16, 25, 20],
              circleStrokeWidth: 1.5,
              circleStrokeColor: 'rgba(255,255,255,0.5)',
            }}
          />
          <SymbolLayer
            id="venue-cluster-count"
            filter={['has', 'point_count']}
            style={{
              textField: ['get', 'point_count_abbreviated'],
              textSize: 11,
              textColor: '#ffffff',
              textAllowOverlap: true,
            }}
          />
          <CircleLayer
            id="venue-points"
            filter={['!', ['has', 'point_count']]}
            style={{
              circleColor: 'rgba(168, 85, 247, 0.8)',
              circleRadius: 6,
              circleStrokeWidth: 1.5,
              circleStrokeColor: 'rgba(255,255,255,0.6)',
            }}
          />
        </ShapeSource>

        {/* Friends out tonight — avatar pins with relationship rings */}
        {friends.map((friend, index) => (
          <FriendMarker
            key={friend.user_id}
            friend={friend}
            index={index}
            onPress={handleFriendPress}
          />
        ))}
      </MapView>

      {/* Floating controls */}
      <View className="absolute top-safe-offset-3 right-4 gap-2">
        <Pressable
          onPress={() => router.push('/search')}
          className="w-10 h-10 rounded-full items-center justify-center bg-[#1a0f2e]/90 border border-white/10 active:opacity-70"
        >
          <SymbolView name="magnifyingglass" size={18} tintColor="rgba(255,255,255,0.8)" />
        </Pressable>
        <Pressable
          onPress={() => router.push('/activity')}
          className="w-10 h-10 rounded-full items-center justify-center active:opacity-90"
          style={{ backgroundColor: PURPLE }}
        >
          <SymbolView name="bell" size={18} tintColor="#ffffff" />
          {unreadCount > 0 ? (
            <View className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 items-center justify-center">
              <Text className="text-white text-[9px] font-sans-semibold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={recenter}
          className="w-10 h-10 rounded-full items-center justify-center bg-[#1a0f2e]/90 border border-white/10 active:opacity-70"
        >
          <SymbolView name="location" size={18} tintColor="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>

      {/* Relationship legend — bottom-left above the tab bar */}
      <View className="absolute bottom-safe-offset-16 left-4 flex-row gap-3 px-3 py-2 rounded-full bg-[#1a0f2e]/90 border border-white/10">
        {(
          [
            ['close', 'Close'],
            ['direct', 'Friend'],
            ['mutual', 'Mutual'],
          ] as const
        ).map(([key, label]) => (
          <View key={key} className="flex-row items-center gap-1.5">
            <View
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: RELATIONSHIP_COLORS[key] }}
            />
            <Text className="text-white/70 text-xs font-sans-medium">{label}</Text>
          </View>
        ))}
      </View>

      {/* Friend ID card */}
      {session ? (
        <FriendIdCard
          friend={selectedFriend}
          isOpen={friendCardOpen}
          onOpenChange={setFriendCardOpen}
          friendsAtVenue={
            selectedFriend
              ? friends.filter(
                  (f) =>
                    f.user_id !== selectedFriend.user_id &&
                    !!selectedFriend.venue_name &&
                    f.venue_name.toLowerCase() === selectedFriend.venue_name.toLowerCase()
                )
              : []
          }
          currentUserId={session.user.id}
          onSelectFriend={(f) => {
            setFriendCardOpen(false);
            setTimeout(() => handleFriendPress(f), 250);
          }}
          onOpenVenue={openVenueByName}
        />
      ) : null}
    </View>
  );
}
