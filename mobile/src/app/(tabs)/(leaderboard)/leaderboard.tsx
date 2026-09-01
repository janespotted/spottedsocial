import { useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { Chip, Skeleton, Tabs } from 'heroui-native';
import { useQuery } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';

type City = 'nyc' | 'la';

interface RankedVenue {
  id: string;
  name: string;
  neighborhood: string;
  liveCount: number;
  popularityRank: number | null;
}

/**
 * Baseline venue ranking (popularity_rank, curated) blended with live
 * check-in counts: venues with live activity float above baseline-only
 * venues; ties fall back to baseline order. Mirrors the web leaderboard's
 * baseline+live hybrid (SOW §7a).
 */
async function fetchLeaderboard(city: City): Promise<RankedVenue[]> {
  const nowIso = new Date().toISOString();
  const [{ data: baseline }, { data: liveStatuses }] = await Promise.all([
    supabase
      .from('venues')
      .select('id, name, neighborhood, popularity_rank')
      .eq('city', city)
      .eq('is_demo', false)
      .order('popularity_rank', { ascending: true, nullsFirst: false })
      .limit(30),
    supabase
      .from('night_statuses')
      .select('venue_id, user_id, is_demo, venues!inner(city)')
      .eq('venues.city', city)
      .eq('is_demo', false)
      .eq('status', 'out')
      .not('venue_id', 'is', null)
      .gt('expires_at', nowIso),
  ]);

  const liveCounts = new Map<string, Set<string>>();
  for (const s of liveStatuses ?? []) {
    if (!s.venue_id) continue;
    if (!liveCounts.has(s.venue_id)) liveCounts.set(s.venue_id, new Set());
    liveCounts.get(s.venue_id)!.add(s.user_id);
  }

  return (baseline ?? [])
    .map((v) => ({
      id: v.id,
      name: v.name,
      neighborhood: v.neighborhood,
      liveCount: liveCounts.get(v.id)?.size ?? 0,
      popularityRank: v.popularity_rank,
    }))
    .sort((a, b) => {
      if (b.liveCount !== a.liveCount) return b.liveCount - a.liveCount;
      return (a.popularityRank ?? 9999) - (b.popularityRank ?? 9999);
    });
}

function VenueRow({ venue, index }: { venue: RankedVenue; index: number }) {
  return (
    <View className="bg-surface rounded-2xl p-3.5 flex-row items-center gap-3 mb-2">
      <Text
        className={
          index < 3
            ? 'text-warning text-lg font-bold tabular-nums min-w-7'
            : 'text-accent text-lg font-bold tabular-nums min-w-7'
        }
      >
        {index + 1}
      </Text>
      <View className="flex-1 gap-0.5">
        <Text className="text-foreground text-base font-semibold">{venue.name}</Text>
        <Text className="text-muted text-sm">{venue.neighborhood}</Text>
      </View>
      {venue.liveCount > 0 ? (
        <Chip variant="secondary" size="sm" color="success">
          <Chip.Label>{venue.liveCount} here</Chip.Label>
        </Chip>
      ) : null}
    </View>
  );
}

function RowSkeleton() {
  return (
    <View className="bg-surface rounded-2xl p-3.5 flex-row items-center gap-3 mb-2">
      <Skeleton className="h-6 w-7 rounded-md" />
      <View className="flex-1 gap-1.5">
        <Skeleton className="h-3.5 w-40 rounded-md" />
        <Skeleton className="h-3 w-24 rounded-md" />
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const [city, setCity] = useState<City>('nyc');
  const contentContainerStyle = useResolveClassNames('p-4');
  const { data: venues, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['leaderboard', city],
    queryFn: () => fetchLeaderboard(city),
    staleTime: 30_000,
  });

  return (
    <LegendList
      data={venues ?? []}
      keyExtractor={(v) => v.id}
      recycleItems
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={contentContainerStyle}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColorClassName="accent-accent"
        />
      }
      ListHeaderComponent={
        <Tabs
          value={city}
          onValueChange={(v) => setCity(v as City)}
          variant="primary"
          className="mb-3 self-start"
        >
          <Tabs.List>
            <Tabs.Indicator className="bg-accent" />
            <Tabs.Trigger value="nyc" className="px-6">
              <Tabs.Label
                className={city === 'nyc' ? 'text-accent-foreground font-bold' : 'text-muted'}
              >
                NYC
              </Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger value="la" className="px-6">
              <Tabs.Label
                className={city === 'la' ? 'text-accent-foreground font-bold' : 'text-muted'}
              >
                LA
              </Tabs.Label>
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs>
      }
      ListEmptyComponent={
        isLoading ? (
          <View>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </View>
        ) : (
          <Text className="text-muted text-base p-4">No venues yet for this city.</Text>
        )
      }
      renderItem={({ item, index }) => <VenueRow venue={item} index={index} />}
    />
  );
}
