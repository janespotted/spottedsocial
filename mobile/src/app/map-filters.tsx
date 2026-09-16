import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Description, Label, RadioGroup } from 'heroui-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  isDefaultMapFilters,
  resetMapFilters,
  setMapFilters,
  useMapFilters,
  type RelationshipFilter,
  type VenueTypeFilter,
} from '@/lib/map-filters';
import { NEON } from '@/lib/theme';

const PEOPLE_OPTIONS: Array<{ value: RelationshipFilter; label: string; desc: string }> = [
  { value: 'all', label: 'Everyone', desc: 'Show all friends & venues' },
  { value: 'close', label: 'Close Friends Only', desc: 'Only close friends, still show venues' },
  { value: 'friends_only', label: 'Friends Only', desc: 'Hide venue pins' },
];

const VENUE_OPTIONS: Array<{ key: VenueTypeFilter; label: string; icon: SFSymbol }> = [
  { key: 'all', label: 'All Venues', icon: 'map' },
  { key: 'nightclub', label: 'Clubs', icon: 'music.note' },
  { key: 'cocktail_bar', label: 'Cocktails', icon: 'wineglass' },
  { key: 'bar', label: 'Bars', icon: 'mug' },
  { key: 'restaurant', label: 'Restaurants', icon: 'fork.knife' },
  { key: 'rooftop', label: 'Rooftops', icon: 'building.2' },
];

/**
 * "Show on Map" filters — native form sheet (liquid glass on iOS 26), port
 * of the web map's filter drawer.
 */
export default function MapFiltersSheet() {
  const filters = useMapFilters();
  const filtered = !isDefaultMapFilters(filters);

  return (
    <View className="px-5 pt-6 pb-10 gap-6">
      <View className="flex-row items-center justify-between">
        <View className="gap-0.5">
          <Text className="text-white text-lg font-sans-semibold">Show on Map</Text>
          <Text className="text-white/45 text-xs font-sans">Changes what you see, not who can see you.</Text>
        </View>
        {filtered ? (
          <Pressable
            onPress={() => {
              resetMapFilters();
              router.back();
            }}
            hitSlop={6}
            accessibilityLabel="Reset filters"
            className="h-9 px-3.5 rounded-full items-center justify-center border active:opacity-70"
            style={{ borderColor: 'rgba(212,255,0,0.45)', backgroundColor: 'rgba(212,255,0,0.12)' }}
          >
            <Text className="text-xs font-sans-semibold" style={{ color: NEON }}>Reset</Text>
          </Pressable>
        ) : null}
      </View>

      {/* People filter */}
      <View className="gap-3">
        <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
          People
        </Text>
        <RadioGroup
          value={filters.relationship}
          onValueChange={(value) => {
            setMapFilters({ relationship: value as RelationshipFilter });
            router.back();
          }}
        >
          {PEOPLE_OPTIONS.map((opt) => (
            <RadioGroup.Item
              key={opt.value}
              value={opt.value}
              className={`rounded-xl px-3 py-3 mb-2 border ${
                filters.relationship === opt.value
                  ? 'bg-[#a855f7]/20 border-[#a855f7]/40'
                  : 'bg-[#2d1b4e]/50 border-transparent'
              }`}
            >
              {/* Stack label over description; default radio sits to the right */}
              <View className="flex-1 pr-2 gap-0.5">
                <Label className="text-white text-sm font-sans-medium">{opt.label}</Label>
                <Description className="text-white/40 text-xs font-sans">{opt.desc}</Description>
              </View>
            </RadioGroup.Item>
          ))}
        </RadioGroup>
      </View>

      {/* Venue type filter */}
      <View className="gap-3">
        <Text className="text-white/60 text-xs font-sans-semibold uppercase tracking-wider">
          Venue Type
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {VENUE_OPTIONS.map((filter) => (
            <Pressable
              key={filter.key}
              onPress={() => {
                setMapFilters({ venueType: filter.key });
                router.back();
              }}
              className={`flex-row items-center gap-2 px-3 py-2.5 rounded-xl border ${
                filters.venueType === filter.key
                  ? 'bg-[#a855f7]/25 border-[#a855f7]/40'
                  : 'bg-[#2d1b4e]/50 border-transparent'
              }`}
              style={{ width: '48%' }}
            >
              <SymbolView
                name={filter.icon}
                size={15}
                tintColor={filters.venueType === filter.key ? '#d4ff00' : 'rgba(255,255,255,0.7)'}
              />
              <Text
                className={`text-sm ${
                  filters.venueType === filter.key
                    ? 'text-[#d4ff00] font-sans-semibold'
                    : 'text-white/70 font-sans'
                }`}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
