import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';

const PURPLE = '#a855f7';

interface VenueEvent {
  id: string;
  title: string;
  event_date: string;
  start_time: string;
  ticket_url: string | null;
  friendsInterested: { id: string; display_name: string; avatar_url: string | null }[];
  isDown: boolean;
}

/** "18:00" → "6PM" */
function formatTimeTo12Hour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}${minutes > 0 ? ':' + minutes.toString().padStart(2, '0') : ''}${period}`;
}

/** Tonight / Tomorrow / weekday / "Fri, Jan 3" — port of getSmartEventDateLabel. */
function getSmartEventDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAway = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (daysAway === 0) return 'Tonight';
  if (daysAway === 1) return 'Tomorrow';
  if (daysAway > 1 && daysAway <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Upcoming events at a venue with friend RSVPs and "I'm Down" toggle. */
export function VenueEventsSection({ venueId }: { venueId: string }) {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const queryClient = useQueryClient();
  const queryKey = ['venue-events', venueId];

  const { data: events } = useQuery({
    queryKey,
    enabled: !!venueId && !!session,
    queryFn: async (): Promise<VenueEvent[]> => {
      const today = new Date().toISOString().split('T')[0];
      const { data: rows } = await supabase
        .from('events')
        .select('id, title, event_date, start_time, ticket_url')
        .eq('venue_id', venueId)
        .gte('event_date', today)
        .gt('expires_at', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(5);
      if (!rows?.length) return [];

      const [{ data: rsvps }, profiles] = await Promise.all([
        supabase
          .from('event_rsvps')
          .select('event_id, user_id, rsvp_type')
          .in('event_id', rows.map((e) => e.id)),
        fetchProfilesSafe(),
      ]);
      const profileMap = buildProfileMap(profiles);
      const friendSet = new Set(friendIds ?? []);

      return rows.map((event) => {
        const eventRsvps = (rsvps ?? []).filter((r) => r.event_id === event.id);
        return {
          ...event,
          isDown: eventRsvps.some((r) => r.user_id === session!.user.id),
          friendsInterested: eventRsvps
            .filter((r) => friendSet.has(r.user_id) && profileMap.has(r.user_id))
            .map((r) => ({
              id: r.user_id,
              display_name: profileMap.get(r.user_id)!.display_name,
              avatar_url: profileMap.get(r.user_id)!.avatar_url,
            })),
        };
      });
    },
  });

  const toggleRsvp = async (event: VenueEvent) => {
    if (!session) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (event.isDown) {
      await supabase
        .from('event_rsvps')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', session.user.id);
    } else {
      await supabase
        .from('event_rsvps')
        .insert({ event_id: event.id, user_id: session.user.id, rsvp_type: 'interested' });
    }
    queryClient.invalidateQueries({ queryKey });
  };

  if (!events?.length) return null;

  return (
    <View className="gap-2">
      <Text className="text-sm font-sans-semibold text-white">Upcoming Events</Text>
      {events.map((event) => (
        <View
          key={event.id}
          className="p-3 rounded-lg bg-[#a855f7]/10 border border-[#a855f7]/20 flex-row items-start"
        >
          <View className="flex-1 min-w-0">
            <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>
              {event.title}
            </Text>
            <Text className="text-white/50 text-xs font-sans mt-0.5">
              {getSmartEventDateLabel(event.event_date)} • {formatTimeTo12Hour(event.start_time)}
            </Text>
            {event.friendsInterested.length > 0 ? (
              <View className="flex-row items-center gap-2 mt-2">
                <View className="flex-row -space-x-1.5">
                  {event.friendsInterested.slice(0, 3).map((friend) => (
                    <Avatar
                      key={friend.id}
                      name={friend.display_name}
                      url={friend.avatar_url}
                      size="sm"
                    />
                  ))}
                </View>
                <Text className="text-[10px] text-white/50 font-sans">
                  {event.friendsInterested.length} friend
                  {event.friendsInterested.length > 1 ? 's' : ''} interested
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => toggleRsvp(event)}
            className="ml-2 px-3 py-1.5 rounded-lg active:opacity-80"
            style={{
              backgroundColor: event.isDown ? 'rgba(168,85,247,0.2)' : PURPLE,
              borderWidth: event.isDown ? 1 : 0,
              borderColor: 'rgba(168,85,247,0.3)',
            }}
          >
            <Text
              className="text-xs font-sans-semibold"
              style={{ color: event.isDown ? PURPLE : '#ffffff' }}
            >
              {event.isDown ? '✓ Down' : "I'm Down"}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
