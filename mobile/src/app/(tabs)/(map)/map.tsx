import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
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
  Images,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
} from '@rnmapbox/maps';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CITY_CENTERS } from '@/lib/city-neighborhoods';
import { stopSharing } from '@/lib/night-status';
import { useSession } from '@/hooks/use-session';
import { useNotifications } from '@/hooks/use-notifications';
import { useMapData, type MapFriend } from '@/hooks/use-map-data';
import { useArrivalPrompts } from '@/hooks/use-arrival-prompts';
import { invalidateNightStatusQueries, useOwnNightStatus } from '@/hooks/use-own-night-status';
import { Avatar } from '@/components/avatar';
import { openFriendCard } from '@/lib/friend-card';
import { DropdownMenu } from '@/components/dropdown-menu';
import {
  isDefaultMapFilters,
  peopleFilterIncludes,
  resetMapFilters,
  setMapFilters,
  useMapFilters,
} from '@/lib/map-filters';
import { StatusPill } from '@/components/header-actions';
import { FriendsOutPill } from '@/components/friends-out-pill';
import { getCurrentPosition } from '@/lib/background-location';
import { getLocationPermission, hasLocationAccess, requestWhenInUse } from '@/lib/location-ready';
import { IconButton } from '@/components/icon-button';
import { SmartArrivalPrompt, VenueMoveBanner } from '@/components/venue-move-banner';
import { NEON } from '@/lib/theme';
import { RESET_COPY } from '@/lib/reset-copy';
import venuePinImage from '../../../../assets/images/venue-pin.png';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? null);

// Relationship ring colors — must match the legend (web map parity)
const RELATIONSHIP_COLORS: Record<string, string> = {
  close: '#d4ff00',
  direct: '#9333ea',
  mutual: '#6366f1',
};

// Same-spot grouping threshold (~5m) and zoom above which clustering stops
const CLUSTER_THRESHOLD = 0.000045;
const NO_CLUSTER_ZOOM = 18;

const stalenessMins = (f: MapFriend): number =>
  f.last_location_at ? (Date.now() - new Date(f.last_location_at).getTime()) / 60000 : 999;

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

/** Ringed avatar circle (or house icon for private parties). `selected`
 *  = the friend whose card is open: a wider lime halo ties pin and card
 *  together (addendum v3 §1). */
function PersonCircle({
  friend,
  isSelf,
  selected,
}: {
  friend: MapFriend;
  isSelf?: boolean;
  selected?: boolean;
}) {
  const ring = RELATIONSHIP_COLORS[friend.relationshipType] ?? RELATIONSHIP_COLORS.direct;
  return (
    <View
      className="rounded-full p-px"
      style={{
        borderWidth: 3,
        borderColor: ring,
        boxShadow: selected ? `0 0 0 3px ${NEON}, 0 0 18px ${NEON}aa` : `0 0 8px ${ring}66`,
        transform: [{ scale: selected ? 1.15 : 1 }],
      }}
    >
      {friend.is_private_party ? (
        <View className="w-8 h-8 rounded-full bg-[#1a0f2e]/90 items-center justify-center">
          <SymbolView name="house.fill" size={16} tintColor="#ffffff" />
        </View>
      ) : (
        <Avatar name={friend.display_name} url={friend.avatar_url} size={isSelf ? 'md' : 'sm'} />
      )}
    </View>
  );
}

function FriendMarker({
  friend,
  index,
  isSelf,
  selected,
  onPress,
}: {
  friend: MapFriend;
  index: number;
  isSelf?: boolean;
  selected?: boolean;
  onPress: (friend: MapFriend) => void;
}) {
  const stale = stalenessMins(friend) >= 15;
  return (
    <MarkerView coordinate={[friend.lng, friend.lat]} allowOverlap>
      <Animated.View
        entering={ZoomIn.springify().damping(14).delay(index * 60)}
        style={stale && !selected ? { opacity: 0.5 } : undefined}
      >
        {friend.relationshipType === 'close' ? (
          <PulseRing color={RELATIONSHIP_COLORS.close} />
        ) : null}
        <Pressable onPress={() => onPress(friend)} hitSlop={6} accessibilityLabel={friend.display_name}>
          <PersonCircle friend={friend} isSelf={isSelf} selected={selected} />
        </Pressable>
      </Animated.View>
    </MarkerView>
  );
}

/** Group marker: up to 3 member circles, +N badge when more (web parity).
 *  Tapping opens the "Friends at [Venue]" list — avatars + names, anchored
 *  to the pin — before any card (addendum v3 §11.4). */
function FriendGroupMarker({
  cluster,
  index,
  onSelectMember,
}: {
  cluster: MapFriend[];
  index: number;
  onSelectMember: (friend: MapFriend) => void;
}) {
  const order: Record<string, number> = { close: 0, direct: 1, mutual: 2 };
  const sorted = [...cluster].sort(
    (a, b) => (order[a.relationshipType] ?? 1) - (order[b.relationshipType] ?? 1)
  );
  const shown = sorted.slice(0, 3);
  const extra = cluster.length - shown.length;
  const size = cluster.length <= 3 ? 72 : 80;

  // Member positions: 2 → side-by-side, 3 → triangle (web groupMarkerHtml)
  const positions: Array<{ top?: number; bottom?: number; left?: number; right?: number }> =
    shown.length === 2
      ? [
          { top: size / 2 - 19, left: 0 },
          { top: size / 2 - 19, right: 0 },
        ]
      : shown.length === 3
        ? [
            { top: 0, left: size / 2 - 19 },
            { bottom: 2, left: 2 },
            { bottom: 2, right: 2 },
          ]
        : [{ top: size / 2 - 19, left: size / 2 - 19 }];

  const venueName = cluster[0].venue_name;
  return (
    <MarkerView coordinate={[cluster[0].lng, cluster[0].lat]} allowOverlap>
      <Animated.View entering={ZoomIn.springify().damping(14).delay(index * 60)}>
        <DropdownMenu
          title={venueName ? `Friends at ${venueName}` : 'Friends here'}
          options={sorted.map((f) => ({
            key: f.user_id,
            label: f.display_name,
            avatar: { name: f.display_name, url: f.avatar_url },
          }))}
          selectedKey={null}
          onSelect={(key) => {
            const member = cluster.find((f) => f.user_id === key);
            if (member) onSelectMember(member);
          }}
          accessibilityLabel={`${cluster.length} friends${venueName ? ` at ${venueName}` : ' here'}`}
        >
          <View style={{ width: size, height: size }}>
            <View className="absolute inset-0 rounded-full border border-white/15" />
            {shown.map((member, i) => (
              <View key={member.user_id} style={{ position: 'absolute', ...positions[i] }}>
                <PersonCircle friend={member} />
              </View>
            ))}
            {extra > 0 ? (
              <View className="absolute -bottom-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#1a0f2e] border border-white/30 items-center justify-center">
                <Text className="text-white text-[11px] font-sans-semibold">+{extra}</Text>
              </View>
            ) : null}
          </View>
        </DropdownMenu>
      </Animated.View>
    </MarkerView>
  );
}

/** Promoted venue pin — halo + purple circle, above clustered venue dots */
function PromotedVenueMarker({
  venue,
  onPress,
}: {
  venue: { id: string; name: string; lat: number; lng: number };
  onPress: (venueId: string, lng: number, lat: number) => void;
}) {
  return (
    <MarkerView coordinate={[venue.lng, venue.lat]} allowOverlap>
      <Pressable
        onPress={() => onPress(venue.id, venue.lng, venue.lat)}
        hitSlop={6}
        style={{ width: 42, height: 42 }}
        className="items-center justify-center"
      >
        <View className="absolute inset-0 rounded-full bg-[#d4ff00]/10" />
        <View
          className="w-[30px] h-[30px] rounded-full items-center justify-center border border-white/60"
          style={{
            backgroundColor: 'rgba(168, 85, 247, 0.75)',
            boxShadow: '0 0 6px rgba(212, 255, 0, 0.1)',
          }}
        >
          <SymbolView name="mappin" size={15} tintColor="#ffffff" />
        </View>
      </Pressable>
    </MarkerView>
  );
}

export default function MapScreen() {
  const { session } = useSession();
  const { unreadCount } = useNotifications();
  const queryClient = useQueryClient();
  const cameraRef = useRef<Camera>(null);
  const mapRef = useRef<MapView>(null);
  const { height: windowHeight } = useWindowDimensions();

  const { data: city } = useQuery({
    queryKey: ['home-city', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('city')
        .eq('id', session!.user.id)
        .maybeSingle<{ city: string | null }>();
      return data?.city ?? 'nyc';
    },
  });

  // Own profile for the self marker
  const { data: selfProfile } = useQuery({
    queryKey: ['self-profile', session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', session!.user.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data } = useMapData(city ?? null);
  const friends = data?.friends ?? [];
  const venues = data?.venues ?? [];
  // "No" tonight: precise pins are withheld (see useMapData); show the count + CTA
  const { data: ownNight } = useOwnNightStatus();
  const stayingIn = ownNight?.status?.status === 'home';
  const hiddenFriendCount = data?.hiddenFriendCount ?? 0;

  // The friend whose card sheet is open — their pin gets the lime halo
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const mapFilters = useMapFilters();
  const { people: peopleFilter, showVenues, venueType: venueFilter } = mapFilters;
  // The original build's "Friends" chip: my friends only — no venues, no
  // mutuals. A viewing shortcut over the same filter store as the sheet.
  const friendsOnly = !showVenues && peopleFilter !== 'mutual_friends';
  const toggleFriendsOnly = () => {
    Haptics.selectionAsync();
    if (friendsOnly) setMapFilters({ showVenues: true, people: 'mutual_friends' });
    else setMapFilters({ showVenues: false, people: 'all_friends' });
  };
  const filtersActive = !isDefaultMapFilters(mapFilters);
  const [locating, setLocating] = useState(false);
  const [shouldCluster, setShouldCluster] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  const {
    myStatus,
    smartPrompt,
    acceptSmartPrompt,
    dismissSmartPrompt,
    moveBanner,
    acceptMove,
    dismissMove,
  } = useArrivalPrompts();

  const center = CITY_CENTERS[city ?? 'nyc'] ?? CITY_CENTERS.nyc;

  // ── Friend clustering (web parity: same venue OR ~5m GPS proximity) ──
  const { clusters, selfSolo } = useMemo(() => {
    // People tier is a viewing choice (Close Friends ⊂ Friends ⊂ + Mutuals)
    let filtered = friends.filter((f) => peopleFilterIncludes(peopleFilter, f.relationshipType));
    filtered = filtered.filter((f) => stalenessMins(f) < 60);

    const self: MapFriend | null =
      session && selfProfile && myStatus?.status === 'out' && myStatus.lat && myStatus.lng
        ? {
            user_id: session.user.id,
            lat: myStatus.lat,
            lng: myStatus.lng,
            venue_name: myStatus.venue_name ?? '',
            display_name: selfProfile.display_name ?? 'Me',
            avatar_url: selfProfile.avatar_url,
            relationshipType: 'close', // self gets highest priority ring
            is_private_party: false,
            party_neighborhood: null,
            last_location_at: new Date().toISOString(),
          }
        : null;

    const groups: MapFriend[][] = [];
    const assigned = new Set<string>();
    for (const friend of filtered) {
      if (assigned.has(friend.user_id)) continue;
      const cluster = [friend];
      assigned.add(friend.user_id);
      if (shouldCluster) {
        for (const other of filtered) {
          if (assigned.has(other.user_id)) continue;
          const sameVenue =
            !!friend.venue_name &&
            !!other.venue_name &&
            friend.venue_name.toLowerCase() === other.venue_name.toLowerCase();
          const closeGps =
            Math.abs(friend.lat - other.lat) < CLUSTER_THRESHOLD &&
            Math.abs(friend.lng - other.lng) < CLUSTER_THRESHOLD;
          if (sameVenue || closeGps) {
            cluster.push(other);
            assigned.add(other.user_id);
          }
        }
      }
      groups.push(cluster);
    }

    // Merge self into an overlapping cluster (self shown first)
    let selfMerged = false;
    if (self && shouldCluster) {
      for (const cluster of groups) {
        const sameVenue =
          !!self.venue_name &&
          !!cluster[0].venue_name &&
          self.venue_name.toLowerCase() === cluster[0].venue_name.toLowerCase();
        const closeGps =
          Math.abs(cluster[0].lat - self.lat) < CLUSTER_THRESHOLD &&
          Math.abs(cluster[0].lng - self.lng) < CLUSTER_THRESHOLD;
        if (sameVenue || closeGps) {
          cluster.unshift(self);
          selfMerged = true;
          break;
        }
      }
    }

    return { clusters: groups, selfSolo: self && !selfMerged ? self : null };
  }, [friends, shouldCluster, peopleFilter, session, selfProfile, myStatus]);

  // ── Venues: independent on/off switch, then type filter, promoted split ──
  const typeFilteredVenues = !showVenues
    ? []
    : venueFilter === 'all'
      ? venues
      : venues.filter((v) => v.type === venueFilter);
  const promotedVenues = typeFilteredVenues.filter((v) => v.is_map_promoted);
  const regularVenues = typeFilteredVenues.filter((v) => !v.is_map_promoted);

  const venueGeoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: regularVenues.map((v) => ({
      type: 'Feature',
      id: v.id,
      geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
      properties: { venueId: v.id, name: v.name },
    })),
  };

  const flyTo = (lng: number, lat: number, zoomLevel: number, duration = 800) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel,
      animationDuration: duration,
    });
  };

  // Opening a venue or a friend pans (same zoom) so the pin sits above the
  // sheet, and remembers where the map was; dismissing the sheet puts the
  // map back exactly there (client feedback §7, addendum v3 §1).
  const cameraBeforeSheet = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const rememberCamera = async () => {
    try {
      const [[east, north], [west, south]] = await mapRef.current!.getVisibleBounds();
      const zoom = await mapRef.current!.getZoom();
      cameraBeforeSheet.current = { center: [(east + west) / 2, (north + south) / 2], zoom };
    } catch {
      cameraBeforeSheet.current = null;
    }
  };
  const panAboveSheet = (lng: number, lat: number, sheetFraction: number) => {
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      padding: {
        paddingTop: 0,
        paddingLeft: 0,
        paddingRight: 0,
        paddingBottom: Math.round(windowHeight * sheetFraction),
      },
      animationDuration: 500,
    });
  };
  const openVenue = async (venueId: string, lng: number, lat: number) => {
    await rememberCamera();
    panAboveSheet(lng, lat, 0.5);
    router.push({ pathname: '/venue', params: { venueId } });
  };

  // Tapping a person opens their card over the map (the same /friend-card
  // sheet every other surface uses) with the pin highlighted; the card is
  // content-sized, so the pan is shallower than for the venue sheet.
  const handleFriendPress = async (friend: MapFriend) => {
    if (!session || friend.user_id === session.user.id) return; // self — no card
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await rememberCamera();
    panAboveSheet(friend.lng, friend.lat, 0.35);
    setSelectedFriendId(friend.user_id);
    openFriendCard(friend.user_id, session.user.id);
  };

  useFocusEffect(
    useCallback(() => {
      setSelectedFriendId(null);
      const saved = cameraBeforeSheet.current;
      if (!saved) return;
      cameraBeforeSheet.current = null;
      cameraRef.current?.setCamera({
        centerCoordinate: saved.center,
        zoomLevel: saved.zoom,
        padding: { paddingTop: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: 0 },
        animationDuration: 500,
      });
    }, [])
  );

  const handleVenuePress = async (event: { features?: GeoJSON.Feature[] }) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const props = feature.properties as Record<string, any> | null;
    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    if (props?.cluster) {
      const currentZoom = await mapRef.current?.getZoom();
      flyTo(lng, lat, Math.min((currentZoom ?? 13) + 2, 17), 500);
      return;
    }
    if (props?.venueId) openVenue(props.venueId, lng, lat);
  };

  // Recenter on the user, not the city (client feedback §6). Keeps the
  // current zoom and never touches filters; falls back to the city centre
  // only when there is no location permission or no fix.
  // Recenter goes to the user's own fix or nowhere (addendum v3 §8.3): the
  // old fallback panned to the city centre, which read as "the wrong place".
  // Never asked yet (skipped in onboarding) → this tap is the ask; iOS shows
  // the standard prompt. Denied → Settings, where the row now exists.
  const recenter = async () => {
    if (locating) return;
    setLocating(true);
    try {
      let permission = await getLocationPermission();
      if (permission === 'not_determined') permission = await requestWhenInUse();
      const me = hasLocationAccess(permission) ? await getCurrentPosition() : null;
      if (me) {
        cameraRef.current?.setCamera({ centerCoordinate: [me.lng, me.lat], animationDuration: 800 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }
      if (!hasLocationAccess(permission)) {
        // iOS can only open the app's own Settings page (Settings › Spotted);
        // there is no public link to the Location Services screen, so the
        // copy names the row to tap.
        Alert.alert(
          'Location is off',
          'In Settings, open Spotted › Location and choose “While Using the App” to center the map on you.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert('Still locating', "Couldn't get a fix yet — try again in a moment.");
      }
    } finally {
      setLocating(false);
    }
  };

  return (
    <View className="flex-1 bg-[#110a24]">
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        styleURL="mapbox://styles/mapbox/dark-v11"
        logoEnabled={false}
        attributionPosition={{ bottom: 150, left: 8 }}
        scaleBarEnabled={false}
        onPress={() => setFocusMode((prev) => !prev)}
        onCameraChanged={(e) => {
          const zoom = e.properties?.zoom ?? 13;
          setShouldCluster((prev) => {
            const next = zoom < NO_CLUSTER_ZOOM;
            return next === prev ? prev : next;
          });
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: [center.lng, center.lat], zoomLevel: 13 }}
        />

        {/* Venue dots + clusters — muted purple so friends dominate */}
        {/* Teardrop venue pin (original build parity) — a symbol image, so
            hundreds of venues stay one layer, not hundreds of views */}
        <Images images={{ 'venue-pin': venuePinImage }} />
        <ShapeSource
          id="venues"
          shape={venueGeoJSON}
          cluster
          clusterRadius={50}
          clusterMaxZoomLevel={14}
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
          <SymbolLayer
            id="venue-points"
            filter={['!', ['has', 'point_count']]}
            style={{
              iconImage: 'venue-pin',
              iconSize: 0.34,
              iconAnchor: 'bottom',
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />
        </ShapeSource>

        {/* Promoted venue pins — rendered before friends so friends sit above */}
        {promotedVenues.map((venue) => (
          <PromotedVenueMarker key={venue.id} venue={venue} onPress={openVenue} />
        ))}

        {/* Friends out tonight — grouped when overlapping, solo otherwise */}
        {clusters.map((cluster, index) =>
          cluster.length >= 2 && shouldCluster ? (
            <FriendGroupMarker
              key={`cluster-${cluster
                .map((f) => f.user_id)
                .sort()
                .join('-')}`}
              cluster={cluster}
              index={index}
              onSelectMember={handleFriendPress}
            />
          ) : (
            cluster.map((friend) => (
              <FriendMarker
                key={friend.user_id}
                friend={friend}
                index={index}
                selected={selectedFriendId === friend.user_id}
                onPress={handleFriendPress}
              />
            ))
          )
        )}

        {/* Self marker (when out and not merged into a cluster) */}
        {selfSolo ? (
          <FriendMarker friend={selfSolo} index={0} isSelf onPress={() => {}} />
        ) : null}
      </MapView>

      {/* Map shell (addendum v3 §11.3 — the original build's hierarchy):
          wordmark + city badge with the bell and status pill on the top
          row; the search bar, Friends chip and filter control beneath. */}
      {!focusMode ? (
        <View className="absolute top-safe-offset-3 left-4 right-4 gap-3" pointerEvents="box-none">
          <View className="flex-row items-center justify-between h-10" pointerEvents="box-none">
            <View className="flex-row items-center gap-2 flex-1 min-w-0" pointerEvents="box-none">
              <Text
                className="text-white font-sans-light"
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{
                  fontSize: 20,
                  letterSpacing: 20 * 0.28,
                  textShadowColor: 'rgba(0,0,0,0.6)',
                  textShadowRadius: 8,
                }}
              >
                Spotted
              </Text>
              {city ? (
                <View className="px-2.5 py-1 rounded-full bg-[#1a0f2e]/85 border border-white/10">
                  <Text className="text-white/70 text-xs font-sans-medium uppercase">{city}</Text>
                </View>
              ) : null}
            </View>
            <View className="flex-row items-center gap-2">
              <IconButton icon="bell" label="Notifications" size={40} badge={unreadCount} onPress={() => router.push('/activity')} />
              <StatusPill />
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.push('/search')}
              accessibilityRole="search"
              accessibilityLabel="Search people, venues"
              className="flex-1 max-w-[260px] h-10 rounded-full px-3 flex-row items-center gap-2 border border-white/15 active:opacity-90"
              style={{ backgroundColor: 'rgba(26, 15, 46, 0.88)' }}
            >
              <SymbolView name="magnifyingglass" size={13} tintColor="rgba(255,255,255,0.5)" />
              <Text className="text-white/50 text-xs font-sans flex-1" numberOfLines={1}>
                Search people, venues…
              </Text>
            </Pressable>
            <Pressable
              onPress={toggleFriendsOnly}
              accessibilityRole="button"
              accessibilityLabel="Friends only"
              accessibilityState={{ selected: friendsOnly }}
              className={`h-10 rounded-full px-3 flex-row items-center gap-1.5 border active:opacity-90 ${
                friendsOnly ? 'border-[#a855f7]/50' : 'border-white/15'
              }`}
              style={{ backgroundColor: friendsOnly ? 'rgba(168,85,247,0.3)' : 'rgba(26, 15, 46, 0.88)' }}
            >
              <SymbolView name="person.2.fill" size={13} tintColor={friendsOnly ? NEON : 'rgba(255,255,255,0.7)'} />
              <Text className="text-xs font-sans-medium" style={{ color: friendsOnly ? NEON : 'rgba(255,255,255,0.7)' }}>
                Friends
              </Text>
            </Pressable>
            <IconButton
              icon="slider.horizontal.3"
              label={filtersActive ? 'Map filters, active' : 'Map filters'}
              size={40}
              state={filtersActive ? 'selected' : 'ordinary'}
              badge={filtersActive}
              onPress={() => router.push('/map-filters')}
            />
          </View>
        </View>
      ) : null}

      {/* My Location — bottom right, above the legend (original placement) */}
      {!focusMode ? (
        <View className="absolute bottom-safe-offset-28 right-4">
          <IconButton
            icon={locating ? 'location.fill' : 'location'}
            label="Recenter on me"
            size={40}
            state={locating ? 'selected' : 'ordinary'}
            onPress={recenter}
          />
        </View>
      ) : null}

      {/* "N out · M TBD" roster pill — bottom left (original placement) */}
      {!focusMode ? (
        <View className="absolute bottom-safe-offset-16 left-4">
          <FriendsOutPill />
        </View>
      ) : null}

      {/* Staying in: aggregate cue instead of pins, with the way back in */}
      {!focusMode && stayingIn ? (
        <View className="absolute top-safe-offset-28 left-4 right-4">
          <View className="rounded-2xl px-4 py-3 bg-[#1a0f2e]/95 border border-white/10 gap-2">
            <Text className="text-white text-sm font-sans-semibold">
              {hiddenFriendCount > 0
                ? `${hiddenFriendCount} ${hiddenFriendCount === 1 ? 'friend is' : 'friends are'} out right now`
                : 'No friends out yet'}
            </Text>
            <Text className="text-white/50 text-xs font-sans">
              Going out after all? Update your status to see who&apos;s where.
            </Text>
            <Pressable
              onPress={() => router.push('/check-in')}
              className="self-start rounded-full px-4 py-2 active:opacity-90"
              style={{ backgroundColor: '#d4ff00' }}
            >
              <Text className="text-[#1a0f2e] text-xs font-sans-semibold">Update status</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Filters hid everything: say so, offer the way out (client feedback §8) */}
      {!focusMode && !stayingIn && filtersActive && clusters.length === 0 && !selfSolo && typeFilteredVenues.length === 0 ? (
        <View className="absolute top-safe-offset-28 left-4 right-4">
          <View className="rounded-2xl px-4 py-3 bg-[#1a0f2e]/95 border border-white/10 gap-2">
            <Text className="text-white text-sm font-sans-semibold">Nothing matches your filters</Text>
            <Text className="text-white/50 text-xs font-sans">
              {friends.length > 0 || venues.length > 0
                ? 'Friends and venues are hidden by the current filters.'
                : 'No friends are sharing yet, and venues are hidden.'}
            </Text>
            <Pressable
              onPress={resetMapFilters}
              accessibilityRole="button"
              className="self-start rounded-full px-4 min-h-9 justify-center active:opacity-90"
              style={{ backgroundColor: '#d4ff00' }}
            >
              <Text className="text-[#1a0f2e] text-xs font-sans-semibold">Clear filters</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Arrival prompts — top banners */}
      {!focusMode && (smartPrompt || moveBanner) ? (
        <View className="absolute top-safe-offset-28 left-4 right-4 gap-2">
          {smartPrompt ? (
            <SmartArrivalPrompt
              venueName={smartPrompt.venue.name}
              onAccept={acceptSmartPrompt}
              onDismiss={dismissSmartPrompt}
            />
          ) : null}
          {moveBanner ? (
            <VenueMoveBanner
              venueName={moveBanner.venue.name}
              onAccept={acceptMove}
              onDismiss={dismissMove}
            />
          ) : null}
        </View>
      ) : null}

      {/* Status pill — current status, Update status, Stop sharing */}
      {!focusMode ? (
        <View className="absolute bottom-safe-offset-28 left-16 right-16 items-center" pointerEvents="box-none">
          {myStatus?.status === 'out' ? (
            <View className="flex-row items-center gap-1 pl-4 pr-1 py-1 rounded-full bg-[#1a0f2e]/95 border border-[#d4ff00]/30">
              <View className="w-2 h-2 rounded-full bg-[#d4ff00]" />
              <Pressable
                onPress={() => router.push('/check-in')}
                accessibilityLabel="Update status"
                className="py-2 pr-2 pl-1 active:opacity-70"
              >
                <Text className="text-white text-sm font-sans-medium" numberOfLines={1}>
                  {myStatus.venue_name ? `@ ${myStatus.venue_name}` : "You're out"}
                </Text>
                {/* The rule, where the user can see their own sharing (addendum v3 §3) */}
                <Text className="text-white/50 text-[11px] font-sans">{RESET_COPY.liveUntil}</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!session) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  await stopSharing(session.user.id, { city });
                  invalidateNightStatusQueries(queryClient);
                }}
                accessibilityLabel="Stop sharing"
                hitSlop={4}
                className="min-h-11 px-3 rounded-full items-center justify-center border border-red-400/40 active:bg-red-500/15"
              >
                <Text className="text-red-300 text-sm font-sans-medium">Stop sharing</Text>
              </Pressable>
            </View>
          ) : myStatus?.status === 'planning' || myStatus?.status === 'off' ? (
            <Pressable
              onPress={() => router.push('/check-in')}
              accessibilityLabel="Update status"
              className="flex-row items-center gap-2 px-4 min-h-11 rounded-full bg-[#1a0f2e]/95 border border-[#a855f7]/40 active:opacity-90"
            >
              <SymbolView
                name={myStatus.status === 'planning' ? 'target' : 'eye.slash'}
                size={13}
                tintColor="#a855f7"
              />
              <Text className="text-white text-sm font-sans-medium">
                {myStatus.status === 'planning' ? 'TBD tonight' : 'Out · location hidden'}
              </Text>
              <Text className="text-white/55 text-xs font-sans">Update</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/check-in')}
              className="px-5 min-h-11 justify-center rounded-full active:opacity-90"
              style={{ backgroundColor: '#d4ff00', boxShadow: '0 4px 16px rgba(212,255,0,0.3)' }}
            >
              <Text className="text-[#1a0f2e] text-sm font-sans-semibold">Update status</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Relationship legend — bottom-left above the tab bar */}
      {!focusMode ? (
        <View className="absolute bottom-safe-offset-16 right-4 flex-row gap-3 px-3 py-2 rounded-full bg-[#1a0f2e]/90 border border-white/10">
          {(
            [
              ['close', 'Close Friend'],
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
      ) : null}

    </View>
  );
}
