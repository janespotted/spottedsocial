import { useState } from 'react';
import { Linking, Pressable, Share, Text, View } from 'react-native';
import { Image } from '@/components/styled';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  formatTimeTo12Hour,
  toggleEventRsvp,
  type EventWithFriends,
} from '@/lib/plans';
import { Avatar } from '@/components/avatar';
import { PURPLE, VIOLET_FILL } from '@/lib/theme';

/** Tonight / Tomorrow / weekday / "Fri, Jan 3" — events use the weekday form. */
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

interface EventCardProps {
  event: EventWithFriends;
  currentUserId: string;
}

/** Port of the web EventCard: purple event card with friend RSVPs + "I'm Down". */
export function EventCard({ event, currentUserId }: EventCardProps) {
  const queryClient = useQueryClient();
  const [isDown, setIsDown] = useState(event.isDown);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleDown = async () => {
    if (isToggling) return;
    setIsToggling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await toggleEventRsvp(event.id, currentUserId, isDown);
      if (!isDown) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsDown(!isDown);
      queryClient.invalidateQueries({ queryKey: ['plan-events'] });
    } catch (e) {
      console.error('Error toggling RSVP:', e);
    } finally {
      setIsToggling(false);
    }
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Share.share({
      message: `Check out ${event.title} at ${event.venue_name}!${event.ticket_url ? ` ${event.ticket_url}` : ''}`,
    });
  };

  const handleTicket = () => {
    if (!event.ticket_url) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(event.ticket_url);
  };

  const openVenue = () => {
    if (event.venue_id) router.push({ pathname: '/venue', params: { venueId: event.venue_id } });
  };

  const goingCount = event.friendsInterested.filter((f) => f.rsvp_type === 'going').length;
  const interestedCount = event.friendsInterested.length;

  return (
    <View className="rounded-2xl overflow-hidden border border-[#a855f7]/20 bg-[#a855f7]/10">
      {/* Cover image */}
      {event.cover_image_url ? (
        <Image source={{ uri: event.cover_image_url }} className="w-full h-32" contentFit="cover" />
      ) : null}

      {/* Badge + actions overlay */}
      <View className="absolute top-3 left-3 z-10 bg-[#a855f7]/80 rounded-full px-2.5 py-1">
        <Text className="text-white text-[10px] font-sans-semibold tracking-wider">🎉 EVENT</Text>
      </View>
      <View className="absolute top-3 right-3 z-10 flex-row gap-2">
        <Pressable
          onPress={handleShare}
          hitSlop={4}
          className="w-8 h-8 rounded-full bg-black/50 items-center justify-center active:opacity-70"
        >
          <SymbolView name="square.and.arrow.up" size={14} tintColor="#ffffff" />
        </Pressable>
        {event.ticket_url ? (
          <Pressable
            onPress={handleTicket}
            hitSlop={4}
            className="w-8 h-8 rounded-full bg-black/50 items-center justify-center active:opacity-70"
          >
            <SymbolView name="ticket" size={14} tintColor="#ffffff" />
          </Pressable>
        ) : null}
      </View>

      <View className={`p-4 ${event.cover_image_url ? '' : 'pt-12'}`}>
        <Text className="text-white text-lg font-sans-semibold mb-1 pr-16">{event.title}</Text>

        <Pressable
          onPress={openVenue}
          className="flex-row items-center gap-1.5 mb-2 active:opacity-70 self-start"
        >
          <SymbolView name="mappin" size={13} tintColor="rgba(255,255,255,0.5)" />
          <Text className="text-[#d4ff00] text-sm font-sans-medium">{event.venue_name}</Text>
        </Pressable>

        <View className="flex-row items-center gap-3 mb-3">
          <View className="flex-row items-center gap-1.5">
            <SymbolView name="calendar" size={11} tintColor="rgba(255,255,255,0.5)" />
            <Text className="text-white text-xs font-sans-semibold">
              {getSmartEventDateLabel(event.event_date)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <SymbolView name="clock" size={11} tintColor="rgba(255,255,255,0.5)" />
            <Text className="text-white/70 text-xs font-sans">
              {formatTimeTo12Hour(event.start_time)}
              {event.end_time ? ` - ${formatTimeTo12Hour(event.end_time)}` : ''}
            </Text>
          </View>
        </View>

        {event.description ? (
          <Text className="text-white/80 text-sm font-sans mb-3" numberOfLines={2}>
            {event.description}
          </Text>
        ) : null}

        {/* Friends interested */}
        {event.friendsInterested.length > 0 ? (
          <View className="flex-row items-center gap-2 mb-3">
            <View className="flex-row">
              {event.friendsInterested.slice(0, 5).map((friend, i) => (
                <View
                  key={friend.user_id}
                  className="rounded-full border-2 border-[#110a24]"
                  style={{ marginLeft: i === 0 ? 0 : -8 }}
                >
                  <Avatar name={friend.display_name} url={friend.avatar_url} size="sm" />
                </View>
              ))}
              {event.friendsInterested.length > 5 ? (
                <View
                  className="w-8 h-8 rounded-full bg-[#a855f7]/20 border-2 border-[#110a24] items-center justify-center"
                  style={{ marginLeft: -8 }}
                >
                  <Text className="text-[#a855f7] text-[10px] font-sans-medium">
                    +{event.friendsInterested.length - 5}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="text-white/60 text-xs font-sans">
              {goingCount > 0
                ? `${goingCount} friend${goingCount > 1 ? 's' : ''} going`
                : `${interestedCount} friend${interestedCount > 1 ? 's' : ''} interested`}
            </Text>
          </View>
        ) : null}

        {/* I'm Down button */}
        <Pressable
          onPress={handleToggleDown}
          disabled={isToggling}
          className={`w-full py-2.5 rounded-xl items-center active:opacity-80 ${
            isDown ? 'bg-[#a855f7]/20 border border-[#a855f7]/30' : ''
          }`}
          style={isDown ? undefined : { backgroundColor: VIOLET_FILL }}
        >
          <Text
            className={`text-sm font-sans-semibold ${isDown ? 'text-[#a855f7]' : 'text-white'}`}
          >
            {isDown ? "✓ I'm Down" : "I'm Down"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
