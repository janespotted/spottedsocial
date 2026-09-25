import { useEffect, useState } from 'react';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { ActionSheetIOS, Pressable, RefreshControl, Text, View } from 'react-native';
import { Image } from '@/components/styled';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { LegendList } from '@legendapp/list/react-native';
import { useQuery } from '@tanstack/react-query';
import { useResolveClassNames } from 'uniwind';
import { supabase } from '@/lib/supabase';
import { CITY_NEIGHBORHOODS, getCityLabel } from '@/lib/city-neighborhoods';
import { useSession } from '@/hooks/use-session';
import { useNotifications } from '@/hooks/use-notifications';
import {
  useLeaderboard,
  type BiggestMover,
  type LeaderboardFriend,
  type LeaderboardVenue,
} from '@/hooks/use-leaderboard';
import { Avatar } from '@/components/avatar';
import { DropdownMenu } from '@/components/dropdown-menu';
import { HeaderActions } from '@/components/header-actions';
import { NEON, PURPLE, VIOLET_FILL } from '@/lib/theme';

function openVenue(venueName: string, venueId?: string | null) {
  if (venueId) {
    router.push({ pathname: '/venue', params: { venueId } });
    return;
  }
  // If no venue_id, look it up by name
  supabase
    .from('venues')
    .select('id')
    .eq('name', venueName)
    .maybeSingle()
    .then(({ data }) => {
      if (data?.id) router.push({ pathname: '/venue', params: { venueId: data.id } });
    });
}

/* ── Friend avatar stack (popover → action sheet on native) ── */

function showFriendsSheet(venueName: string, friends: LeaderboardFriend[]) {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: `Friends at ${venueName}`,
      options: [...friends.map((f) => f.display_name), 'Close'],
      cancelButtonIndex: friends.length,
    },
    () => {}
  );
}

function FriendStack({
  venueName,
  friends,
}: {
  venueName: string;
  friends: LeaderboardFriend[];
}) {
  if (friends.length === 0) return null;
  return (
    <Pressable
      onPress={() => showFriendsSheet(venueName, friends)}
      className="flex-row items-center active:opacity-70"
    >
      <View className="flex-row">
        {friends.slice(0, 3).map((friend, idx) => (
          <View
            key={friend.user_id}
            className="rounded-full border-2 border-[#1e1338]"
            style={idx > 0 ? { marginLeft: -8 } : undefined}
          >
            <Avatar name={friend.display_name} url={friend.avatar_url} size="sm" />
          </View>
        ))}
      </View>
      {friends.length > 3 ? (
        <Text className="ml-1.5 text-xs text-white/60 font-sans-medium">
          +{friends.length - 3}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* ── Cards ── */

function PromotedCard({ venue }: { venue: LeaderboardVenue }) {
  const subLine = [venue.neighborhood, venue.count > 0 ? `${venue.count} sharing this spot` : null]
    .filter(Boolean)
    .join(' · ');
  // Whole row opens the venue (client feedback §9), not just the name
  return (
    <Pressable
      onPress={() => openVenue(venue.venue_name, venue.venue_id)}
      accessibilityRole="button"
      accessibilityLabel={`${venue.venue_name}, promoted. Open venue`}
      className="rounded-2xl p-4 mb-3 bg-[#1e1338] border border-white/[0.06] active:opacity-80"
    >
      <View className="flex-row items-center gap-3">
        <View className="px-2.5 py-1 bg-[#a855f7]/15 rounded-full">
          <Text className="text-[10px] text-[#a855f7] font-sans-semibold uppercase tracking-wide">
            Promoted
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-base font-sans-semibold text-white" numberOfLines={1}>
            {venue.venue_name}
          </Text>
          {subLine ? (
            <Text className="text-white/55 text-xs mt-0.5 font-sans" numberOfLines={1}>
              {subLine}
            </Text>
          ) : null}
        </View>
        {venue.isNewlyOpened ? (
          <View className="px-2 py-0.5 bg-[#d4ff00]/15 rounded-full">
            <Text className="text-[10px] text-[#d4ff00] font-sans-semibold">NEW</Text>
          </View>
        ) : null}
        <FriendStack venueName={venue.venue_name} friends={venue.friends} />
      </View>
    </Pressable>
  );
}

function VenueCard({ venue }: { venue: LeaderboardVenue }) {
  const isTop1 = venue.rank === 1;
  const isTop3 = venue.rank >= 1 && venue.rank <= 3;

  const subParts: string[] = [];
  if (venue.neighborhood) subParts.push(venue.neighborhood);
  if (venue.count > 0) subParts.push(`${venue.count} sharing this spot`);
  const subLine = subParts.join(' · ');

  // Whole row opens the venue (client feedback §9), not just the name
  return (
    <Pressable
      onPress={() => openVenue(venue.venue_name, venue.venue_id)}
      accessibilityRole="button"
      accessibilityLabel={`Number ${venue.rank}, ${venue.venue_name}. Open venue`}
      className={`relative overflow-hidden rounded-2xl mb-3 active:opacity-80 ${
        isTop1
          ? 'bg-[#221540] p-5 border border-[#d4ff00]/20'
          : isTop3
            ? 'bg-[#1e1338] p-4 border border-white/[0.08]'
            : 'bg-[#1a1030] p-4 border border-white/[0.06]'
      }`}
      style={isTop1 ? { boxShadow: '0 4px 20px rgba(168,85,247,0.15)' } : undefined}
    >
      {/* Subtle top glow for #1 */}
      {isTop1 ? <View className="absolute inset-x-0 top-0 h-px bg-[#d4ff00]/30" /> : null}

      <View className="flex-row items-center gap-3">
        {/* Rank Number */}
        <View className="w-10 items-center">
          <Text
            className={`font-sans-semibold tabular-nums ${
              isTop1 ? 'text-4xl text-[#d4ff00]' : isTop3 ? 'text-3xl text-[#d4ff00]' : 'text-2xl text-white/50'
            }`}
            style={
              isTop1
                ? { textShadowColor: 'rgba(212,255,0,0.3)', textShadowRadius: 8 }
                : undefined
            }
          >
            {venue.rank}
          </Text>
        </View>

        {/* Venue Info */}
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text
              className={`shrink font-sans-semibold text-white ${isTop1 ? 'text-lg' : 'text-base'}`}
              numberOfLines={1}
            >
              {venue.venue_name}
            </Text>
            {venue.isNewlyOpened ? (
              <View className="px-2 py-0.5 bg-[#d4ff00]/15 rounded-full">
                <Text className="text-[10px] text-[#d4ff00] font-sans-semibold">NEW</Text>
              </View>
            ) : null}
            {venue.movement === 'up' ? (
              <SymbolView name="chevron.up" size={16} tintColor={NEON} weight="semibold" />
            ) : null}
            {venue.movement === 'down' ? (
              <SymbolView name="chevron.down" size={16} tintColor="#ef4444" weight="semibold" />
            ) : null}
          </View>
          {subLine ? (
            <Text className="text-white/55 text-xs mt-0.5 font-sans" numberOfLines={1}>
              {subLine}
            </Text>
          ) : null}
        </View>

        <FriendStack venueName={venue.venue_name} friends={venue.friends} />
      </View>
    </Pressable>
  );
}

/* ── Skeleton (port of LeaderboardSkeleton) ── */

function LeaderboardSkeleton() {
  return (
    <View>
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <View key={i} className="rounded-2xl p-4 mb-3 bg-white/[0.06]">
          <View className="flex-row items-center gap-4">
            <View className="h-8 w-8 bg-[#a855f7]/20 rounded" />
            <View className="flex-1 h-5 bg-[#a855f7]/20 rounded" />
            <View className="flex-row">
              <View className="h-6 w-6 bg-[#a855f7]/20 rounded-full" />
              <View className="h-6 w-6 bg-[#a855f7]/20 rounded-full" style={{ marginLeft: -8 }} />
            </View>
            <View className="flex-row items-end gap-0.5">
              <View className="w-1.5 h-2 bg-[#a855f7]/20 rounded-sm" />
              <View className="w-1.5 h-3 bg-[#a855f7]/20 rounded-sm" />
              <View className="w-1.5 h-4 bg-[#a855f7]/20 rounded-sm" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ── Header (static — port of the web PageHeader; no collapse per app rules) ── */

const ALL_KEY = '__all__';

function LeaderboardHeader({
  city,
  neighborhood,
  unreadCount,
  onSelectNeighborhood,
}: {
  city: string | null;
  neighborhood: string | null;
  unreadCount: number;
  onSelectNeighborhood: (neighborhood: string | null) => void;
}) {
  const cityLabel = getCityLabel(city ?? 'nyc');
  const neighborhoodOptions = [
    { key: ALL_KEY, label: `All ${cityLabel}` },
    ...(CITY_NEIGHBORHOODS[city ?? 'nyc'] ?? []).map((hood) => ({ key: hood, label: hood })),
  ];
  return (
    <View className="pt-safe-offset-3 z-10" style={{ backgroundColor: 'rgba(26, 15, 46, 0.95)' }}>
      {/* Top bar — same compact layout as the home header, fixed height */}
      <View className="flex-row items-center justify-between px-4 h-10">
        <View className="flex-row items-center gap-2 flex-1 min-w-0">
          <Text
            className="text-white font-sans-light"
            numberOfLines={1}
            style={{ fontSize: 20, letterSpacing: 20 * 0.28 }}
          >
            Spotted
          </Text>
          {city ? (
            <View className="px-2.5 py-1 rounded-full bg-white/10">
              <Text className="text-white/70 text-xs font-sans-medium uppercase">{city}</Text>
            </View>
          ) : null}
        </View>
        <HeaderActions unreadCount={unreadCount} />
      </View>

      {/* Title + subtitle — full-width rows below the top bar */}
      <View className="px-4 pt-2">
        <Text className="text-3xl font-sans-semibold text-white">Leaderboard</Text>
        <Text className="text-white/50 text-sm mt-0.5 font-sans">Top spots tonight</Text>
      </View>

      {/* Neighborhood filter — the original build's Spotted dropdown, not
          the system action sheet (addendum v3 §8.8) */}
      <View className="px-4 pt-3 pb-3 flex-row">
        <DropdownMenu
          options={neighborhoodOptions}
          selectedKey={neighborhood ?? ALL_KEY}
          onSelect={(key) => onSelectNeighborhood(key === ALL_KEY ? null : key)}
          accessibilityLabel="Filter by neighborhood"
        >
          <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/5 border border-white/15">
            <Text className="text-white font-sans-medium text-sm">
              {neighborhood || `All ${cityLabel}`}
            </Text>
            <SymbolView name="chevron.down" size={12} tintColor="rgba(255,255,255,0.6)" />
          </View>
        </DropdownMenu>
      </View>
    </View>
  );
}

/* ── Active spot — a list item, not a float over the last rows (§9) ── */

function BiggestMoverCard({ mover }: { mover: BiggestMover }) {
  return (
    <Pressable
      onPress={() => openVenue(mover.venue_name, mover.venue_id)}
      accessibilityRole="button"
      accessibilityLabel={`Active spot, ${mover.venue_name}. Open venue`}
      className="mt-1 bg-[#1e1338] border border-[#a855f7]/30 rounded-2xl p-3.5 active:opacity-80"
    >
      <View className="flex-row items-center gap-3">
        <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(168,85,247,0.18)' }}>
          <SymbolView name="arrow.up.right" size={15} tintColor={PURPLE} weight="semibold" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[#c084fc] text-xs font-sans-semibold uppercase tracking-wide mb-0.5">
            Active spot
          </Text>
          <Text className="text-base font-sans-semibold text-white" numberOfLines={1}>
            {mover.venue_name}
          </Text>
        </View>
        <FriendStack venueName={mover.venue_name} friends={mover.friends} />
      </View>
    </Pressable>
  );
}

/* ── Screen ── */

export default function LeaderboardScreen() {
  const { session } = useSession();
  const { unreadCount } = useNotifications();
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  // pb clears the native tab bar + home indicator with a visible gap
  const contentContainerStyle = useResolveClassNames('px-4 py-4 pb-28');

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

  // Reset neighborhood filter when city changes
  useEffect(() => {
    setNeighborhood(null);
  }, [city]);

  const { data, isLoading, isError, refetch } = useLeaderboard(city ?? null, neighborhood);
  const { refreshing, onRefresh } = usePullToRefresh(refetch);
  const venues = data?.venues ?? [];
  const biggestMover = data?.biggestMover ?? null;

  return (
    <View className="flex-1">
      <LeaderboardHeader
        city={city ?? null}
        neighborhood={neighborhood}
        unreadCount={unreadCount}
        onSelectNeighborhood={setNeighborhood}
      />

      <LegendList
        data={venues}
        keyExtractor={(v) => v.venue_name}
        recycleItems
        contentContainerStyle={contentContainerStyle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColorClassName="accent-[#d4ff00]"
          />
        }
        ListHeaderComponent={<Text className="text-white/50 text-xs px-1 pb-3">Activity visible to you, followed by popular venues to explore. Catalog ranking does not imply a live crowd.</Text>}
        ListEmptyComponent={
          isError ? (<Pressable onPress={() => refetch()} className="p-6"><Text className="text-white">Could not load venue activity. Tap to retry.</Text></Pressable>) : isLoading ? (
            <LeaderboardSkeleton />
          ) : (
            <View className="items-center justify-center py-16 px-4">
              <View className="w-20 h-20 rounded-full bg-white/5 items-center justify-center mb-6">
                <SymbolView name="chart.bar" size={40} tintColor="rgba(168,85,247,0.6)" />
              </View>
              <Text className="text-xl font-sans-semibold text-white mb-2 text-center">
                The night hasn&apos;t started yet
              </Text>
              <Text className="text-white/50 text-sm font-sans text-center max-w-xs mb-6">
                When people check in, the hottest spots show up here.
              </Text>
              <Pressable
                onPress={() => router.push('/check-in')}
                className="rounded-full px-6 min-h-11 justify-center active:opacity-90"
                style={{ backgroundColor: VIOLET_FILL }}
              >
                <Text className="text-white font-sans-semibold">Be the First</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) =>
          item.isPromoted ? <PromotedCard venue={item} /> : <VenueCard venue={item} />
        }
        ListFooterComponent={biggestMover ? <BiggestMoverCard mover={biggestMover} /> : null}
      />
    </View>
  );
}
