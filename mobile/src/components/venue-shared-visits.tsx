import { Pressable, Text, View } from 'react-native';
import { useVenueVisits } from '@/hooks/use-venue-visits';
import { openFriendCard } from '@/lib/friend-card';
import { Avatar } from './avatar';

/** Existing shared check-ins only. Every photo is a separate profile-card target. */
export function VenueSharedVisits({ venueId, compact = false }: { venueId: string; compact?: boolean }) {
  const people = useVenueVisits(venueId);
  if (!people.length) return null;
  return <View className={compact ? 'mt-2 gap-1' : 'mb-3 py-3 border-b border-white/10 gap-1'}>
    <Text className="text-white/60 text-xs font-sans-medium">Friends who visited recently</Text>
    <View className="flex-row items-center">
      {people.slice(0, 5).map(person => <Pressable key={person.user_id}
        accessibilityRole="button" accessibilityLabel={`Open ${person.display_name}’s friend card`}
        onPress={event => { event.stopPropagation(); openFriendCard(person.user_id); }}
        className="min-h-11 min-w-11 items-start justify-center active:opacity-70">
        <Avatar name={person.display_name} url={person.avatar_url} size="sm" />
      </Pressable>)}
    </View>
  </View>;
}
