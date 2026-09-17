import { Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  isDefaultMapFilters,
  resetMapFilters,
  setMapFilters,
  useMapFilters,
  type PeopleFilter,
  type VenueTypeFilter,
} from '@/lib/map-filters';
import { NEON, PURPLE, control, controlTint, primaryControl, primaryControlText } from '@/lib/theme';

/**
 * Same tier names as the sharing audience, but these descriptions say what
 * the viewer SEES. The sharing sheet (`/audience`) says who can see them.
 */
const PEOPLE_OPTIONS: Array<{ value: PeopleFilter; label: string; desc: string }> = [
  { value: 'close_friends', label: 'Close Friends', desc: 'Only people on your Close Friends list.' },
  { value: 'all_friends', label: 'Friends', desc: 'Everyone you are friends with.' },
  { value: 'mutual_friends', label: 'Friends + Mutuals', desc: 'Friends, plus friends-of-friends who share with mutuals.' },
];

const VENUE_OPTIONS: Array<{ key: VenueTypeFilter; label: string; icon: SFSymbol }> = [
  { key: 'all', label: 'All types', icon: 'map' },
  { key: 'nightclub', label: 'Clubs', icon: 'music.note' },
  { key: 'cocktail_bar', label: 'Cocktails', icon: 'wineglass' },
  { key: 'bar', label: 'Bars', icon: 'mug' },
  { key: 'restaurant', label: 'Restaurants', icon: 'fork.knife' },
  { key: 'rooftop', label: 'Rooftops', icon: 'building.2' },
];

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">{children}</Text>
  );
}

/**
 * "Show on Map" — three independent choices (client feedback §7): which
 * people, whether venues show at all, and which venue types. Nothing here
 * changes who can see the viewer; the note says so.
 */
export default function MapFiltersSheet() {
  const filters = useMapFilters();
  const filtered = !isDefaultMapFilters(filters);

  return (
    <View className="px-5 pt-6 pb-safe-offset-6 gap-6">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-white text-lg font-sans-semibold">Show on Map</Text>
          <Text className="text-white/60 text-xs font-sans leading-4">
            Changes what you see, not who can see you. Your sharing audience is set from your status.
          </Text>
        </View>
        {filtered ? (
          <Pressable
            onPress={resetMapFilters}
            hitSlop={6}
            accessibilityLabel="Reset filters"
            className={`h-9 px-3.5 rounded-full items-center justify-center active:opacity-70 ${control.selected}`}
          >
            <Text className="text-xs font-sans-semibold" style={{ color: NEON }}>Reset</Text>
          </Pressable>
        ) : null}
      </View>

      {/* People — progressive tiers */}
      <View className="gap-2.5">
        <SectionTitle>People</SectionTitle>
        {PEOPLE_OPTIONS.map((opt) => {
          const selected = filters.people === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setMapFilters({ people: opt.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`flex-row items-center gap-3 rounded-xl px-3.5 py-3 ${selected ? control.selected : control.ordinary}`}
            >
              <View className="flex-1 gap-0.5">
                <Text className="text-white text-sm font-sans-medium">{opt.label}</Text>
                <Text className="text-white/60 text-xs font-sans">{opt.desc}</Text>
              </View>
              {selected ? <SymbolView name="checkmark" size={14} weight="semibold" tintColor={NEON} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Venues — on/off, then type */}
      <View className="gap-2.5">
        <SectionTitle>Venues</SectionTitle>
        <View className={`flex-row items-center justify-between rounded-xl px-3.5 py-2.5 ${control.ordinary}`}>
          <View className="flex-1 gap-0.5">
            <Text className="text-white text-sm font-sans-medium">Show venues</Text>
            <Text className="text-white/60 text-xs font-sans">Venue pins and hot spots.</Text>
          </View>
          <Switch
            value={filters.showVenues}
            onValueChange={(v) => setMapFilters({ showVenues: v })}
            trackColor={{ true: PURPLE, false: 'rgba(255,255,255,0.15)' }}
            accessibilityLabel="Show venues"
          />
        </View>
        <View className="flex-row flex-wrap gap-2" style={{ opacity: filters.showVenues ? 1 : 0.4 }}>
          {VENUE_OPTIONS.map((opt) => {
            const selected = filters.venueType === opt.key;
            const state = !filters.showVenues ? 'disabled' : selected ? 'selected' : 'ordinary';
            return (
              <Pressable
                key={opt.key}
                onPress={() => setMapFilters({ venueType: opt.key })}
                disabled={!filters.showVenues}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !filters.showVenues }}
                className={`flex-row items-center gap-2 px-3 py-2.5 rounded-xl ${control[state]}`}
                style={{ width: '48%' }}
              >
                <SymbolView name={opt.icon} size={15} tintColor={controlTint[state]} />
                <Text className={`text-sm ${selected ? 'font-sans-semibold' : 'font-sans'}`} style={{ color: controlTint[state] }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        className={`min-h-12 rounded-full items-center justify-center active:opacity-90 ${primaryControl}`}
      >
        <Text className={`text-[15px] font-sans-semibold ${primaryControlText}`}>Done</Text>
      </Pressable>
    </View>
  );
}
