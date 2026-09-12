import { useEffect, useState } from 'react';
import { ActionSheetIOS, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Dialog } from 'heroui-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { createDmThread } from '@/lib/dm';
import { sendMeetUp } from '@/lib/meet-up';
import { blockUser, reportContent } from '@/lib/moderation';
import { Avatar } from '@/components/avatar';
import type { MapFriend } from '@/hooks/use-map-data';

const NEON = '#d4ff00';

// Gradient ring classes by relationship (web FriendIdCard parity)
const RING_GRADIENTS: Record<string, string> = {
  close: 'bg-gradient-to-br from-[#a855f7] to-[#d4ff00]',
  direct: 'bg-gradient-to-br from-[#a855f7] to-[#a855f7]/60',
  mutual: 'bg-gradient-to-br from-[#a855f7] to-[#6366f1]',
};

const formatLastSeen = (lastLocationAt: string | null): string => {
  if (!lastLocationAt) return '';
  const mins = (Date.now() - new Date(lastLocationAt).getTime()) / 60000;
  if (mins < 5) return 'Now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  return `${Math.round(mins / 60)}h ago`;
};

/**
 * Card body shared by the map's Dialog card and the app-wide /friend-card
 * form sheet: gradient avatar ring, relationship badge, friends-also-here
 * row, Meet Up CTA, message button, report/block overflow.
 */
export function FriendCardBody({
  friend,
  currentUserId,
  onDismiss,
  friendsAtVenue = [],
  onSelectFriend,
  onOpenVenue,
}: {
  friend: MapFriend;
  currentUserId: string;
  /** Close the containing surface (dialog dismiss / sheet router.back) */
  onDismiss: () => void;
  friendsAtVenue?: MapFriend[];
  onSelectFriend?: (friend: MapFriend) => void;
  onOpenVenue?: (venueName: string) => void;
}) {
  const [meetUpSent, setMeetUpSent] = useState(false);
  useEffect(() => {
    setMeetUpSent(false);
  }, [friend.user_id]);

  const ring = RING_GRADIENTS[friend.relationshipType] ?? RING_GRADIENTS.direct;
  const lastSeen = formatLastSeen(friend.last_location_at);

  const handleMeetUp = () => {
    if (meetUpSent) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendMeetUp(currentUserId, friend);
    setMeetUpSent(true);
    setTimeout(() => onDismiss(), 900);
  };

  const handleMessage = async () => {
    try {
      const threadId = await createDmThread(friend.user_id);
      onDismiss();
      setTimeout(() => {
        router.push({
          pathname: '/thread',
          params: {
            threadId,
            title: friend.display_name,
            avatarUrl: friend.avatar_url ?? '',
          },
        });
      }, 250);
    } catch {
      /* demo users / offline — DM stays unavailable */
    }
  };

  const showOverflow = () => {
    const firstName = friend.display_name.split(' ')[0];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Report User', `Block ${firstName}`, 'Cancel'],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) reportContent(currentUserId, { type: 'user', id: friend.user_id });
        if (index === 1) {
          blockUser(currentUserId, friend.user_id, friend.display_name);
          onDismiss();
        }
      }
    );
  };

  const showAlsoHere = () => {
    if (friendsAtVenue.length === 0) return;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Also here tonight',
        options: [...friendsAtVenue.map((f) => f.display_name), 'Cancel'],
        cancelButtonIndex: friendsAtVenue.length,
      },
      (index) => {
        if (index < friendsAtVenue.length) onSelectFriend?.(friendsAtVenue[index]);
      }
    );
  };

  return (
    <View className="p-5">
          {/* Overflow menu */}
          <Pressable
            onPress={showOverflow}
            hitSlop={6}
            className="absolute right-4 top-4 z-10 w-7 h-7 rounded-full bg-white/5 items-center justify-center active:bg-white/10"
          >
            <SymbolView name="ellipsis" size={14} tintColor="rgba(255,255,255,0.5)" />
          </Pressable>

          {/* Avatar + info row */}
          <View className="flex-row items-center gap-4 mb-4">
            <View className={`rounded-full p-[3px] ${ring}`}>
              <View className="rounded-full border-2 border-[#1a1030]">
                <Avatar name={friend.display_name} url={friend.avatar_url} size="lg" />
              </View>
            </View>

            <View className="flex-1 min-w-0">
              <Text className="text-xl font-sans-semibold text-white" numberOfLines={1}>
                {friend.display_name}
              </Text>
              {friend.venue_name ? (
                <Pressable
                  onPress={() => !friend.is_private_party && onOpenVenue?.(friend.venue_name)}
                  hitSlop={4}
                >
                  <Text className="text-[#d4ff00] text-sm font-sans-medium" numberOfLines={1}>
                    @{friend.venue_name}
                  </Text>
                </Pressable>
              ) : null}
              {/* Relationship badge */}
              <View
                className={`self-start mt-1 px-2 py-0.5 rounded-full ${
                  friend.relationshipType === 'close'
                    ? 'bg-[#d4ff00]/15'
                    : friend.relationshipType === 'mutual'
                      ? 'bg-[#6366f1]/15'
                      : 'bg-[#9333ea]/15'
                }`}
              >
                <Text
                  className={`text-[10px] font-sans-semibold uppercase tracking-wide ${
                    friend.relationshipType === 'close'
                      ? 'text-[#d4ff00]'
                      : friend.relationshipType === 'mutual'
                        ? 'text-[#818cf8]'
                        : 'text-[#c084fc]'
                  }`}
                >
                  {friend.relationshipType === 'close'
                    ? 'Close Friend'
                    : friend.relationshipType === 'mutual'
                      ? 'Mutual'
                      : 'Friend'}
                </Text>
              </View>
              {lastSeen ? (
                <Text className="text-white/30 text-xs font-sans mt-0.5">{lastSeen}</Text>
              ) : null}
            </View>
          </View>

          {/* Actions row */}
          <View className="flex-row items-center gap-2">
            {friendsAtVenue.length > 0 ? (
              <Pressable onPress={showAlsoHere} className="flex-row items-center active:opacity-80">
                <View className="flex-row">
                  {friendsAtVenue.slice(0, 2).map((f, idx) => (
                    <View
                      key={f.user_id}
                      className="rounded-full border-2 border-[#1a0f2e]"
                      style={idx > 0 ? { marginLeft: -8 } : undefined}
                    >
                      <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
                    </View>
                  ))}
                </View>
                {friendsAtVenue.length > 2 ? (
                  <Text className="text-white text-sm font-sans-medium ml-1">
                    +{friendsAtVenue.length - 2}
                  </Text>
                ) : null}
              </Pressable>
            ) : null}

            <Pressable
              onPress={handleMeetUp}
              className="flex-1 h-[42px] rounded-full flex-row items-center justify-center gap-2 active:opacity-90"
              style={{
                backgroundColor: meetUpSent ? 'rgba(212,255,0,0.35)' : NEON,
                boxShadow: '0 0 16px rgba(212,255,0,0.25)',
              }}
            >
              <SymbolView
                name={meetUpSent ? 'checkmark' : 'person.badge.plus'}
                size={16}
                tintColor="#000000"
                weight="semibold"
              />
              <Text className="text-black text-sm font-sans-semibold">
                {meetUpSent ? 'Sent' : 'Meet Up'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleMessage}
              hitSlop={4}
              className="w-[42px] h-[42px] rounded-full items-center justify-center border border-white/15 active:bg-white/5"
            >
              <SymbolView name="bubble.left" size={17} tintColor="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
    </View>
  );
}

/**
 * Map's Dialog presentation of the card (HeroUI Native Dialog: animated
 * overlay + drag-to-dismiss). App-wide surfaces use the /friend-card form
 * sheet instead (see lib/friend-card.ts openFriendCard), which stacks above
 * native modals where a Dialog portal cannot.
 */
export function FriendIdCard({
  friend,
  isOpen,
  onOpenChange,
  friendsAtVenue,
  currentUserId,
  onSelectFriend,
  onOpenVenue,
}: {
  friend: MapFriend | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  friendsAtVenue: MapFriend[];
  currentUserId: string;
  onSelectFriend: (friend: MapFriend) => void;
  onOpenVenue: (venueName: string) => void;
}) {
  if (!friend) return null;
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-black/80" />
        <Dialog.Content className="w-full max-w-[390px] bg-[#1a1030] border border-[#a855f7]/30 rounded-3xl p-0">
          <FriendCardBody
            friend={friend}
            currentUserId={currentUserId}
            onDismiss={() => onOpenChange(false)}
            friendsAtVenue={friendsAtVenue}
            onSelectFriend={onSelectFriend}
            onOpenVenue={onOpenVenue}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
