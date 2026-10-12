import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image } from './styled';
import { ErrorState } from './empty-state';
import { useVenueRecommendations } from '@/hooks/use-venue-recommendations';
import { getVenuePhotoUrl } from '@/lib/venues';
import { tonightRecommendations, type RecommendedVenue } from '@/lib/venue-recommendations';
import { NEON, INK_LIGHT, MIST } from '@/lib/theme';

export function RecommendedVenueCard({ venue, compact = false }: { venue: RecommendedVenue; compact?: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [venue.id]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${venue.name}. ${venue.pick.tags.join(', ')}. ${venue.pick.reason} Open venue`}
    onPress={() => router.push({ pathname: '/venue', params: { venueId: venue.id } })}
    className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] active:opacity-80">
    <View style={{ height: compact ? 120 : 155, backgroundColor: INK_LIGHT }} className="items-center justify-center overflow-hidden">
      {!photoFailed ? <Image source={{ uri: getVenuePhotoUrl(venue.id, 0) }} className="absolute inset-0 w-full h-full" contentFit="cover" recyclingKey={venue.id} onError={() => setPhotoFailed(true)} /> :
        <View className="items-center gap-2"><SymbolView name={venue.pick.category === 'club' ? 'waveform' : 'wineglass'} size={32} tintColor={MIST} /><Text className="text-white/50 text-xs font-sans">{venue.pick.category === 'club' ? 'For the music' : 'For a drink'}</Text></View>}
      <View className="absolute top-3 left-3 rounded-full bg-black/65 px-2.5 py-1"><Text className="text-white text-[10px] font-sans-medium">{venue.pick.category === 'club' ? 'Club' : 'Bar'}</Text></View>
    </View>
    <View className="p-3.5 gap-1.5">
      <Text className="text-white text-base font-sans-semibold">{venue.name}</Text>
      <Text className="text-white/60 text-xs font-sans">{venue.pick.neighborhood} · {venue.pick.tags.join(' · ')}</Text>
      {!compact ? <Text className="text-white/80 text-sm font-sans mt-1">{venue.pick.reason}</Text> : null}
      {venue.relevance ? <Text style={{ color: NEON }} className="text-xs font-sans mt-1">{venue.relevance}</Text> : null}
    </View>
  </Pressable>;
}

/** Shown only on a successful empty feed or after the member's posts. Never fabricated activity. */
export function ForTonight() {
  const { width } = useWindowDimensions();
  const recommendations = useVenueRecommendations();
  const rows = tonightRecommendations(recommendations.rows);
  if (recommendations.isPending) return <View className="px-4 gap-3" accessibilityLabel="Loading recommendations"><View className="h-4 w-24 rounded bg-white/10" /><View className="h-44 rounded-2xl bg-white/5" /></View>;
  if (recommendations.isError && !rows.length) return <View className="px-4"><ErrorState compact title="Couldn’t load picks" onRetry={() => { void recommendations.refetch(); }} /></View>;
  if (!rows.length) return null;
  return <View className="gap-3">
    <View className="px-4 flex-row items-center justify-between gap-3">
      <View className="flex-1 gap-1"><Text accessibilityRole="header" className="text-white text-lg font-sans-semibold">For tonight</Text><Text className="text-white/55 text-xs font-sans">Spotted picks</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="See all Spotted picks" onPress={() => router.push('/explore')} className="min-h-11 min-w-11 justify-center"><Text className="text-white/75 text-xs font-sans-medium">See all</Text></Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} decelerationRate="fast" snapToInterval={Math.min(258, width - 64) + 12} snapToAlignment="start">
      {rows.map(venue => <View key={venue.id} style={{ width: Math.min(258, width - 64) }}><RecommendedVenueCard venue={venue} compact /></View>)}
    </ScrollView>
  </View>;
}
