import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNightRecap } from '@/hooks/use-night-recap';
import { useNightMode } from '@/hooks/use-night-mode';
import { type NightRecap } from '@/lib/night-recap';
import { getNightKey } from '@/lib/tonight';
import { openFriendCard } from '@/lib/friend-card';
import { Avatar } from './avatar';

/** Only an unexpired, server-authorized overlap from the immediately preceding night. */
export function sharedVisitsAtVenue(recap: NightRecap | null | undefined, venueId: string, nightKey: string, now: number) {
  if (!recap || !(Date.parse(recap.expires_at) > now)) return [];
  const previousNight = new Date(Date.parse(`${nightKey}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (recap.night_date !== previousNight) return [];
  const seen = new Set<string>();
  return recap.people.filter(person => {
    if (person.venue_id !== venueId || seen.has(person.friend_id)) return false;
    seen.add(person.friend_id);
    return true;
  });
}

/** This is the viewer's existing shared recap, never a new archive of others' locations. */
export function VenueSharedVisits({ venueId }: { venueId: string }) {
  const { data: recap, isError } = useNightRecap();
  const { city } = useNightMode();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const expires = Date.parse(recap?.expires_at ?? '');
    if (!(expires > Date.now())) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(expires - Date.now() + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [recap?.expires_at]);
  const people = isError ? [] : sharedVisitsAtVenue(recap, venueId, getNightKey(new Date(now), city), now);
  if (!people.length) return null;
  return <View className="mb-3 py-3 border-b border-white/10 gap-2.5">
    <Text className="text-white/70 text-xs font-sans-medium">Here last night</Text>
    <View className="flex-row flex-wrap gap-x-4 gap-y-2">
      {people.slice(0, 4).map(person => <Pressable key={person.friend_id} accessibilityRole="button" accessibilityLabel={`Open ${person.display_name}’s profile`} onPress={() => openFriendCard(person.friend_id)} className="min-h-11 flex-row items-center gap-2 active:opacity-70">
        <Avatar name={person.display_name} url={person.avatar_url} size="sm" />
        <Text className="text-white/85 font-sans text-xs" numberOfLines={1}>{person.display_name.split(' ')[0]}</Text>
      </Pressable>)}
    </View>
  </View>;
}
