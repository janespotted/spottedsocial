import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchProfilesSafe } from '@/lib/profiles';
import { sendFriendRequest } from '@/lib/friends';
import { openFriendCard } from '@/lib/friend-card';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useFriendsOut, type FriendNightStatus } from '@/hooks/use-friends-out';
import { useOwnNightStatus } from '@/hooks/use-own-night-status';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { NEON } from '@/lib/theme';

interface VenueResult {
  id: string;
  name: string;
  neighborhood: string | null;
}

type Mode = 'all' | 'people' | 'venues';

/** Section label, matching the rest of the app's quiet uppercase headers. */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-white/55 text-xs font-sans-medium uppercase tracking-wide">{children}</Text>
  );
}

function VenueRow({
  name,
  subtitle,
  onPress,
  rank,
}: {
  name: string;
  subtitle?: string | null;
  onPress: () => void;
  /** 1-based position — Trending Tonight numbers its rows like the leaderboard. */
  rank?: number;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 active:opacity-70">
      <View className="w-8 h-8 rounded-full bg-[#a855f7]/25 items-center justify-center">
        {rank ? (
          <Text className="text-xs font-sans-semibold" style={{ color: NEON }}>
            {rank}
          </Text>
        ) : (
          <SymbolView name="mappin" size={14} tintColor={NEON} />
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text className="text-white/55 text-xs font-sans" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.3)" />
    </Pressable>
  );
}

/**
 * Search — people, venues and neighborhoods, with discovery before the
 * first keystroke (addendum v3 §11.7). The original build's shape: People
 * and Venues mode chips, "Trending Tonight" and "Friends Out Now" as the
 * zero-query state, and neighborhoods matched from venue data. Discovery
 * is about people and nightlife context, not place autocomplete.
 */
export default function SearchScreen() {
  useDismissKeyboardOnLeave();
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const { data: friendsOut } = useFriendsOut();
  const { data: own } = useOwnNightStatus();
  const [term, setTerm] = useState('');
  const [mode, setMode] = useState<Mode>('all');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  // Usernames render as @name everywhere, so people type the @ — strip it.
  const trimmed = term.trim().toLowerCase().replace(/^@/, '');
  const searching = trimmed.length >= 2;
  const wantsPeople = mode !== 'venues';
  const wantsVenues = mode !== 'people';

  const { data, isFetching } = useQuery({
    queryKey: ['search', trimmed],
    enabled: searching,
    staleTime: 30_000,
    queryFn: async () => {
      const [profiles, { data: venues }, { data: hoods }] = await Promise.all([
        fetchProfilesSafe(),
        supabase
          .from('venues')
          .select('id, name, neighborhood')
          .ilike('name', `%${trimmed}%`)
          .limit(10),
        // Neighborhoods come from venue data — matching one lists its spots
        supabase
          .from('venues')
          .select('id, name, neighborhood')
          .ilike('neighborhood', `%${trimmed}%`)
          .order('popularity_rank', { ascending: true })
          .limit(20),
      ]);
      const people = profiles
        .filter(
          (p) =>
            p.id !== session?.user.id &&
            (p.display_name?.toLowerCase().includes(trimmed) ||
              p.username?.toLowerCase().includes(trimmed))
        )
        .slice(0, 10);
      // Dedupe neighborhood names, keeping how many venues each has
      const byHood = new Map<string, number>();
      for (const v of hoods ?? []) {
        if (!v.neighborhood) continue;
        byHood.set(v.neighborhood, (byHood.get(v.neighborhood) ?? 0) + 1);
      }
      return {
        people,
        venues: (venues ?? []) as VenueResult[],
        neighborhoods: [...byHood.entries()].slice(0, 5).map(([name, count]) => ({ name, count })),
      };
    },
  });

  /** Zero-query discovery: the city's top spots tonight. */
  const { data: trending } = useQuery({
    queryKey: ['search-trending', own?.city],
    enabled: !searching && !!own?.city,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VenueResult[]> => {
      const { data: rows } = await supabase
        .from('venues')
        .select('id, name, neighborhood')
        .eq('city', own!.city)
        .eq('is_demo', false)
        .order('popularity_rank', { ascending: true })
        .limit(5);
      return (rows ?? []) as VenueResult[];
    },
  });

  const friendSet = new Set(friendIds ?? []);
  const outNow = friendsOut?.outFriends ?? [];
  const venuesWithheld = friendsOut?.venuesWithheld ?? false;

  const pendingRequests = useRef(new Set<string>());
  const handleAdd = async (personId: string) => {
    if (!session || pendingRequests.current.has(personId) || sentIds.has(personId)) return;
    pendingRequests.current.add(personId);
    setSentIds(prev => new Set(prev).add(personId));
    try {
      if (!await sendFriendRequest(session.user.id, personId)) throw new Error('Request denied');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setSentIds(prev => { const next = new Set(prev); next.delete(personId); return next; });
      Alert.alert('Request not sent', 'Please check your connection and try again.');
    } finally { pendingRequests.current.delete(personId); }
  };

  const openVenue = (venueId: string) => {
    Keyboard.dismiss();
    router.push({ pathname: '/venue', params: { venueId } });
  };

  const openPerson = (userId: string) => {
    Keyboard.dismiss();
    openFriendCard(userId, session?.user.id);
  };

  const personRow = (p: { id: string; display_name: string; username: string; avatar_url: string | null }) => {
    const isFriend = friendSet.has(p.id);
    const isSent = sentIds.has(p.id);
    return (
      <View key={p.id} className="flex-row items-center gap-3">
        <Pressable
          onPress={() => openPerson(p.id)}
          className="flex-1 flex-row items-center gap-3 min-w-0 active:opacity-70"
        >
          <Avatar name={p.display_name} url={p.avatar_url} size="sm" />
          <View className="flex-1 min-w-0">
            <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
              {p.display_name}
            </Text>
            <Text className="text-white/55 text-xs font-sans" numberOfLines={1}>
              @{p.username}
            </Text>
          </View>
        </Pressable>
        {isFriend ? (
          <View className="flex-row items-center gap-1 px-3 py-1.5">
            <SymbolView name="checkmark" size={12} tintColor="rgba(255,255,255,0.4)" />
            <Text className="text-white/55 text-xs font-sans-medium">Friends</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => !isSent && handleAdd(p.id)}
            disabled={isSent}
            className="rounded-full px-4 py-1.5 active:opacity-80"
            style={{ backgroundColor: isSent ? 'rgba(255,255,255,0.08)' : NEON }}
          >
            <Text
              className="text-xs font-sans-semibold"
              style={{ color: isSent ? 'rgba(255,255,255,0.4)' : '#000' }}
            >
              {isSent ? 'Sent' : 'Add'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  };

  const friendRow = (f: FriendNightStatus) => (
    <Pressable
      key={f.user_id}
      onPress={() => openPerson(f.user_id)}
      className="flex-row items-center gap-3 active:opacity-70"
    >
      <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
      <View className="flex-1 min-w-0">
        <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
          {f.display_name}
        </Text>
        <Text className="text-xs font-sans" style={{ color: NEON }} numberOfLines={1}>
          {venuesWithheld || !f.venue_name ? 'Out tonight' : `At ${f.venue_name}`}
        </Text>
      </View>
      <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.3)" />
    </Pressable>
  );

  const noResults =
    searching &&
    !isFetching &&
    !(wantsPeople && data?.people.length) &&
    !(wantsVenues && (data?.venues.length || data?.neighborhoods.length));

  return (
    <View className="flex-1 bg-[#110a24]">
      {/* Search bar */}
      <View className="flex-row items-center gap-3 px-4 py-3 border-b border-white/10">
        <View className="flex-1 flex-row items-center gap-2 rounded-2xl bg-white/5 border border-white/15 px-3">
          <SymbolView name="magnifyingglass" size={16} tintColor="rgba(255,255,255,0.4)" />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search people, venues, or neighborhoods…"
            placeholderTextColorClassName="accent-white/30"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1 h-11 py-0 text-white text-[15px] font-sans"
          />
          {isFetching ? <ActivityIndicator size="small" color={NEON} /> : null}
          {term.length > 0 && !isFetching ? (
            <Pressable onPress={() => setTerm('')} hitSlop={8} accessibilityLabel="Clear search">
              <SymbolView name="xmark.circle.fill" size={15} tintColor="rgba(255,255,255,0.35)" />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            router.back();
          }}
          hitSlop={8}
        >
          <Text className="text-white/60 text-sm font-sans">Cancel</Text>
        </Pressable>
      </View>

      {/* People / Venues mode chips (original build parity) */}
      <View className="flex-row gap-2 px-4 py-3">
        {(
          [
            ['all', 'All'],
            ['people', 'People'],
            ['venues', 'Venues'],
          ] as const
        ).map(([key, label]) => {
          const active = mode === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                Haptics.selectionAsync();
                setMode(key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`px-3.5 min-h-8 justify-center rounded-full border ${
                active ? 'border-[#d4ff00]/55' : 'border-white/12'
              }`}
              style={{ backgroundColor: active ? 'rgba(212,255,0,0.18)' : 'rgba(255,255,255,0.05)' }}
            >
              <Text
                className="text-xs font-sans-medium"
                style={{ color: active ? NEON : 'rgba(255,255,255,0.7)' }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerClassName="px-4 pb-8 gap-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!searching ? (
          <>
            {/* Friends Out Now — the reason to open search on a night out */}
            {wantsPeople && outNow.length > 0 ? (
              <View className="gap-3">
                <SectionLabel>{`Friends Out Now (${outNow.length})`}</SectionLabel>
                {outNow.slice(0, 8).map(friendRow)}
              </View>
            ) : null}

            {/* Trending Tonight */}
            {wantsVenues && (trending ?? []).length > 0 ? (
              <View className="gap-3">
                <SectionLabel>Trending Tonight</SectionLabel>
                {(trending ?? []).map((v, i) => (
                  <VenueRow
                    key={v.id}
                    name={v.name}
                    subtitle={v.neighborhood}
                    rank={i + 1}
                    onPress={() => openVenue(v.id)}
                  />
                ))}
              </View>
            ) : null}

            {(!wantsPeople || outNow.length === 0) && (!wantsVenues || (trending ?? []).length === 0) ? (
              <Text className="text-white/45 text-sm font-sans text-center py-10">
                Search people, venues or neighborhoods.
              </Text>
            ) : null}
          </>
        ) : (
          <>
            {wantsPeople && data?.people.length ? (
              <View className="gap-3">
                <SectionLabel>People</SectionLabel>
                {data.people.map(personRow)}
              </View>
            ) : null}

            {wantsVenues && data?.neighborhoods.length ? (
              <View className="gap-3">
                <SectionLabel>Neighborhoods</SectionLabel>
                {data.neighborhoods.map((h) => (
                  <Pressable
                    key={h.name}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTerm(h.name);
                    }}
                    className="flex-row items-center gap-3 active:opacity-70"
                  >
                    <View className="w-8 h-8 rounded-full bg-[#a855f7]/25 items-center justify-center">
                      <SymbolView name="map" size={14} tintColor="#a855f7" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
                        {h.name}
                      </Text>
                      <Text className="text-white/55 text-xs font-sans">
                        {h.count} {h.count === 1 ? 'spot' : 'spots'}
                      </Text>
                    </View>
                    <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.3)" />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {wantsVenues && data?.venues.length ? (
              <View className="gap-3">
                <SectionLabel>Venues</SectionLabel>
                {data.venues.map((v) => (
                  <VenueRow
                    key={v.id}
                    name={v.name}
                    subtitle={v.neighborhood}
                    onPress={() => openVenue(v.id)}
                  />
                ))}
              </View>
            ) : null}

            {noResults ? (
              <Text className="text-white/55 text-sm font-sans text-center py-10">
                No results for &ldquo;{term.trim()}&rdquo;
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
