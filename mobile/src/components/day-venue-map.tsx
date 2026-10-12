import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Mapbox, { MapView, Camera, ShapeSource, CircleLayer } from '@rnmapbox/maps';
import { useNightMode } from '@/hooks/use-night-mode';
import { useSession } from '@/hooks/use-session';
import { usePlans } from '@/hooks/use-plans';
import { supabase } from '@/lib/supabase';
import { CITY_CENTERS } from '@/lib/city-neighborhoods';
import { fetchSavedVenueNames } from '@/lib/venue-discovery';
import { ErrorState } from './empty-state';
import { ModeCountdownStrip } from './mode-countdown-strip';
import { HeaderActions } from './header-actions';
import { useNotifications } from '@/hooks/use-notifications';
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ?? null);

/** Public venue coordinates only. No people query, GPS permission or user-location puck. */
export function DayVenueMap() {
  const { city } = useNightMode();
  const { session } = useSession();
  const { unreadCount } = useNotifications();
  const [selected, setSelected] = useState<string | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  useEffect(() => { setSelected(null); setSavedOnly(false); }, [city]);
  const saved = useQuery({ queryKey: ['saved-venues', session?.user.id], enabled: !!session, queryFn: () => fetchSavedVenueNames(session!.user.id) });
  const plans = usePlans();
  const venues = useQuery({ queryKey: ['day-map-venues', city], queryFn: async () => {
    const { data, error } = await supabase.from('venues').select('id,name,lat,lng,neighborhood').eq('city', city).eq('is_demo', false).not('lat', 'is', null).not('lng', 'is', null).order('popularity_rank').limit(500);
    if (error) throw error;
    return data ?? [];
  } });
  const center = CITY_CENTERS[city] ?? CITY_CENTERS.nyc;
  const rows = (venues.data ?? []).filter(v => !savedOnly || saved.data?.includes(v.name) || plans.data?.plans.some(p => p.venue_id === v.id));
  const featureCollection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: rows.map(v => ({ type: 'Feature', id: v.id, properties: { id: v.id, saved: !!(saved.data?.includes(v.name) || plans.data?.plans.some(p => p.venue_id === v.id)) }, geometry: { type: 'Point', coordinates: [v.lng!, v.lat!] } })) };
  const spot = rows.find(v => v.id === selected);
  return <View className="flex-1 bg-[#110a24]">
    <View className="pt-safe-offset-3"><View className="px-4 min-h-11 flex-row items-center gap-3"><Text className="text-white text-xl font-sans-light flex-1">Spotted</Text><HeaderActions unreadCount={unreadCount} /></View><ModeCountdownStrip /></View>
    <View className="px-4 py-3 flex-row flex-wrap items-center gap-3"><Text className="text-white text-lg font-sans-semibold flex-1">Spots for tonight</Text><Pressable accessibilityRole="button" accessibilityState={{ selected: savedOnly }} onPress={() => setSavedOnly(v => !v)} className="min-h-11 px-3 py-2 rounded-full bg-white/10 justify-center"><Text className="text-white text-xs font-sans">{savedOnly ? 'Saved + planned' : 'All spots'}</Text></Pressable></View>
    {venues.isError || (savedOnly && (saved.isError || plans.isError)) ? <ErrorState title="Couldn’t load spots" onRetry={() => { void venues.refetch(); void saved.refetch(); void plans.refetch(); }} /> : <View className="flex-1">
      <MapView key={city} style={{ flex: 1 }} styleURL="mapbox://styles/mapbox/dark-v11" scaleBarEnabled={false}>
        <Camera defaultSettings={{ centerCoordinate: [center.lng, center.lat], zoomLevel: 12 }} />
        <ShapeSource id="day-venues" shape={featureCollection} onPress={e => setSelected(String(e.features[0]?.properties?.id ?? ''))}>
          <CircleLayer id="day-venue-points" style={{ circleRadius: 7, circleColor: ['case', ['get', 'saved'], '#d4ff00', '#a88acc'], circleStrokeColor: '#110a24', circleStrokeWidth: 2 }} />
        </ShapeSource>
      </MapView>
      <View className="absolute bottom-24 left-4 right-4 rounded-2xl p-4 bg-[#1a0f2e] border border-white/10 gap-2">
        {spot ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/venue', params: { venueId: spot.id } })} className="min-h-11 justify-center gap-1"><Text className="text-white font-sans-semibold">{spot.name} ↗</Text><Text className="text-white/60 text-xs font-sans">{spot.neighborhood}</Text></Pressable> : <Text className="text-white/65 text-sm font-sans">{venues.isLoading ? 'Loading spots…' : savedOnly && !rows.length ? 'Save a spot or make a plan to see it here.' : 'Tap a spot. Plan your night.'}</Text>}
        <Pressable accessibilityRole="button" onPress={() => router.push('/explore')} className="min-h-11 justify-center"><Text className="text-[#d4ff00] text-sm font-sans-medium">Browse spots</Text></Pressable>
      </View>
    </View>}
  </View>;
}
