import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { LegendList } from '@legendapp/list/react-native';
import { useResolveClassNames } from 'uniwind';
import { useSession } from '@/hooks/use-session';
import { useNightMode } from '@/hooks/use-night-mode';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { getCityLabel } from '@/lib/city-neighborhoods';
import { fetchDiscoveryVenues, fetchSavedVenueNames, VENUE_PAGE_SIZE, type DiscoveryVenue } from '@/lib/venue-discovery';
import { getVenuePhotoUrl, getVenueTypeDisplay } from '@/lib/venues';
import { NEON } from '@/lib/theme';
import { Image } from './styled';
import { EmptyState, ErrorState } from './empty-state';

function VenueRow({ venue, saved }: { venue: DiscoveryVenue; saved: boolean }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [venue.id]);
  const type = getVenueTypeDisplay(venue.type ?? 'bar');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${venue.name}${saved ? ', saved' : ''}. Open venue`}
      onPress={() => router.push({ pathname: '/venue', params: { venueId: venue.id } })}
      className="flex-row items-center gap-3 py-3 border-b border-white/[0.06] active:opacity-70">
      <View className="w-16 h-16 rounded-2xl overflow-hidden bg-white/[0.05] items-center justify-center">
        {venue.google_photo_refs?.length && !photoFailed ? (
          <Image source={{ uri: getVenuePhotoUrl(venue.id, 0) }} className="w-full h-full" contentFit="cover" recyclingKey={venue.id} onError={() => setPhotoFailed(true)} />
        ) : <SymbolView name={type.icon} size={24} tintColor="rgba(255,255,255,0.55)" />}
      </View>
      <View className="flex-1 min-w-0 gap-1">
        <Text className="text-white text-base font-sans-medium">{venue.name}</Text>
        <Text className="text-white/60 text-xs font-sans">{[venue.neighborhood, type.label].filter(Boolean).join(' · ')}</Text>
      </View>
      <SymbolView name={saved ? 'bookmark.fill' : 'chevron.right'} size={saved ? 16 : 12} tintColor={saved ? NEON : 'rgba(255,255,255,0.5)'} />
    </Pressable>
  );
}

/** A day-safe list; live tabs still mount only at night. Also opens from Home. */
export function VenueDiscovery({ liveKind, standalone = false }: { liveKind?: 'map' | 'leaderboard'; standalone?: boolean }) {
  const { session } = useSession();
  const { city, isNight, opensLabel } = useNightMode();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 200); return () => clearTimeout(timer); }, [search]);
  const saved = useQuery({ queryKey: ['saved-venues', session?.user.id], enabled: !!session,
    queryFn: () => fetchSavedVenueNames(session!.user.id) });
  const venues = useInfiniteQuery({
    queryKey: ['venue-discovery', session?.user.id, city, term, savedOnly ? saved.data : null, savedOnly],
    enabled: !!session && (!savedOnly || saved.isSuccess),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchDiscoveryVenues(city, term, pageParam, savedOnly ? saved.data : undefined),
    getNextPageParam: (last, pages) => last.length === VENUE_PAGE_SIZE ? pages.length : undefined,
    staleTime: 60_000,
  });
  const { refreshing, onRefresh } = usePullToRefresh(async () => { await Promise.all([saved.refetch(), venues.refetch()]); });
  const rows = venues.data?.pages.flat() ?? [];
  const contentContainerStyle = useResolveClassNames(standalone ? 'px-5 pb-safe-offset-8' : 'px-4 pb-32');
  const waiting = search.trim() !== term || venues.isLoading || (savedOnly && saved.isLoading);
  const failed = venues.isError || (savedOnly && saved.isError);
  return (
    <View className="flex-1">
      <View className="px-5 pt-4 pb-3 gap-4">
        <View className="gap-1">
          <Text className="text-white text-2xl font-sans-semibold" accessibilityRole="header">Explore {getCityLabel(city)}</Text>
          <Text className="text-white/60 text-sm font-sans">Save a spot for tonight.</Text>
        </View>
        {!isNight ? <Pressable accessibilityRole="button" onPress={() => router.push('/night-hours')} className="flex-row items-center gap-2 min-h-11 active:opacity-70">
          <SymbolView name="moon.stars" size={14} tintColor={NEON} />
          <Text className="text-white/65 text-xs font-sans flex-1">{liveKind === 'map' ? 'Live map' : liveKind === 'leaderboard' ? 'Live rankings' : 'Night Mode'} opens at {opensLabel}</Text>
          <SymbolView name="chevron.right" size={11} tintColor="rgba(255,255,255,0.5)" />
        </Pressable> : null}
        <View className="flex-row items-center gap-2 min-h-11 rounded-full bg-white/[0.05] border border-white/10 px-4">
          <SymbolView name="magnifyingglass" size={16} tintColor="rgba(255,255,255,0.55)" />
          <TextInput accessibilityLabel="Search venues" value={search} onChangeText={setSearch} placeholder="Search spots" placeholderTextColor="rgba(255,255,255,0.55)" autoCorrect={false} returnKeyType="search" className="flex-1 text-white font-sans text-sm py-3" />
          {search ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} className="min-h-11 min-w-11 items-center justify-center"><SymbolView name="xmark" size={13} tintColor="rgba(255,255,255,0.65)" /></Pressable> : null}
        </View>
        <View className="flex-row gap-2" accessibilityRole="tablist">
          {[false, true].map(value => <Pressable key={String(value)} accessibilityRole="tab" accessibilityState={{ selected: savedOnly === value }} onPress={() => setSavedOnly(value)} className={`min-h-11 px-5 justify-center rounded-full ${savedOnly === value ? 'bg-white/10' : ''}`}>
            <Text className={`text-sm font-sans-medium ${savedOnly === value ? 'text-white' : 'text-white/60'}`}>{value ? 'Saved' : 'All spots'}</Text>
          </Pressable>)}
        </View>
      </View>
      <LegendList data={waiting && search.trim() !== term ? [] : rows} keyExtractor={item => item.id} recycleItems contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColorClassName="accent-[#d4ff00]" />}
        onEndReached={() => { if (venues.hasNextPage && !venues.isFetching && !venues.isError) void venues.fetchNextPage(); }} onEndReachedThreshold={0.4}
        ListEmptyComponent={waiting ? <ActivityIndicator color={NEON} className="py-12" /> : failed ? <ErrorState compact title="Couldn’t load spots" onRetry={onRefresh} retrying={refreshing} /> : <EmptyState compact icon={savedOnly ? 'bookmark' : 'magnifyingglass'} title={term ? 'No matches' : savedOnly ? 'Your next spots' : 'More spots soon'} body={term ? undefined : savedOnly ? 'Save a venue to find it here.' : undefined} actions={term ? [{label:'Clear search',onPress:()=>setSearch(''),primary:true}] : savedOnly ? [{label:'Explore spots',onPress:()=>setSavedOnly(false),primary:true}] : []} />}
        ListFooterComponent={venues.isFetchingNextPage ? <ActivityIndicator color={NEON} className="py-5" /> : failed && rows.length > 0 ? <ErrorState compact title="Couldn’t refresh spots" body="" onRetry={onRefresh} retrying={refreshing} /> : null}
        renderItem={({item}) => <VenueRow venue={item} saved={saved.data?.includes(item.name) ?? false} />}
      />
    </View>
  );
}
