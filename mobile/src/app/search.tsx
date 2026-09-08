import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchProfilesSafe } from '@/lib/profiles';
import { Avatar } from '@/components/avatar';

const NEON = '#d4ff00';

interface VenueResult {
  id: string;
  name: string;
  neighborhood: string | null;
}

/** People + venues search — simplified port of the web UnifiedSearch. */
export default function SearchScreen() {
  const [term, setTerm] = useState('');
  const trimmed = term.trim().toLowerCase();

  const { data, isFetching } = useQuery({
    queryKey: ['search', trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const [profiles, { data: venues }] = await Promise.all([
        fetchProfilesSafe(),
        supabase
          .from('venues')
          .select('id, name, neighborhood')
          .ilike('name', `%${trimmed}%`)
          .limit(10),
      ]);
      const people = profiles
        .filter(
          (p) =>
            p.display_name?.toLowerCase().includes(trimmed) ||
            p.username?.toLowerCase().includes(trimmed)
        )
        .slice(0, 10);
      return { people, venues: (venues ?? []) as VenueResult[] };
    },
  });

  return (
    <View className="flex-1 bg-[#110a24]">
      {/* Search bar */}
      <View className="flex-row items-center gap-3 px-4 py-3 border-b border-white/10">
        <View className="flex-1 flex-row items-center gap-2 rounded-2xl bg-white/5 border border-white/15 px-3">
          <SymbolView name="magnifyingglass" size={16} tintColor="rgba(255,255,255,0.4)" />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Search people or venues"
            placeholderTextColorClassName="accent-white/30"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 h-11 py-0 text-white text-[15px] font-sans"
          />
          {isFetching ? <ActivityIndicator size="small" color={NEON} /> : null}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text className="text-white/60 text-sm font-sans">Cancel</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="p-4 gap-6" keyboardShouldPersistTaps="handled">
        {trimmed.length < 2 ? (
          <Text className="text-white/30 text-sm font-sans text-center py-10">
            Search for friends or spots.
          </Text>
        ) : (
          <>
            {data?.people.length ? (
              <View className="gap-3">
                <Text className="text-white/40 text-xs font-sans-medium uppercase tracking-wide">
                  People
                </Text>
                {data.people.map((p) => (
                  <View key={p.id} className="flex-row items-center gap-3">
                    <Avatar name={p.display_name} url={p.avatar_url} size="sm" />
                    <View className="flex-1 min-w-0">
                      <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
                        {p.display_name}
                      </Text>
                      <Text className="text-white/40 text-xs font-sans" numberOfLines={1}>
                        @{p.username}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {data?.venues.length ? (
              <View className="gap-3">
                <Text className="text-white/40 text-xs font-sans-medium uppercase tracking-wide">
                  Venues
                </Text>
                {data.venues.map((v) => (
                  <Pressable
                    key={v.id}
                    onPress={() =>
                      router.push({ pathname: '/venue', params: { venueId: v.id } })
                    }
                    className="flex-row items-center gap-3 active:opacity-70"
                  >
                    <View className="w-8 h-8 rounded-full bg-[#a855f7]/25 items-center justify-center">
                      <SymbolView name="mappin" size={14} tintColor={NEON} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
                        {v.name}
                      </Text>
                      {v.neighborhood ? (
                        <Text className="text-white/40 text-xs font-sans" numberOfLines={1}>
                          {v.neighborhood}
                        </Text>
                      ) : null}
                    </View>
                    <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.3)" />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {data && !data.people.length && !data.venues.length && !isFetching ? (
              <Text className="text-white/40 text-sm font-sans text-center py-10">
                No results for &ldquo;{term.trim()}&rdquo;
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
