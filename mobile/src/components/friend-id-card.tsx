import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { createDmThread } from '@/lib/dm';
import { sendMeetUp } from '@/lib/meet-up';
import { blockUser, reportContent } from '@/lib/moderation';
import { sendFriendRequest } from '@/lib/friends';
import {
  cancelFriendRequest,
  invalidateFriendGraph,
  removeFriend,
  setCloseFriend,
  setLocationHidden,
  type MutualFriend,
} from '@/lib/friend-relationship';
import { openFriendCard } from '@/lib/friend-card';
import { showToast } from '@/lib/toast';
import { Avatar } from '@/components/avatar';
import { DropdownMenu } from '@/components/dropdown-menu';
import type { MapFriend, RelationshipType } from '@/hooks/use-map-data';
import { NEON, PURPLE } from '@/lib/theme';

export type FriendStatusKind = 'out' | 'party' | 'planning' | 'home' | 'unknown';

/** Everything the card shows; built by app/friend-card.tsx from the userId. */
export interface FriendCardData extends MapFriend {
  username: string | null;
  statusKind: FriendStatusKind;
  /** Secondary line for non-venue states ("TBD tonight — thinking X", "In for the night"). */
  statusLine: string | null;
  distanceMi: number | null;
  /** The viewer hides their own location from this person. */
  locationHidden: boolean;
  /** Mutual tier only: the friends the two share. */
  mutualFriends: MutualFriend[];
  /** Mutual tier only: the viewer already sent a friend request. */
  requestPending: boolean;
}

export interface FriendAtVenue {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

// Gradient ring classes by relationship (web FriendIdCard parity)
const RING_GRADIENTS: Record<string, string> = {
  close: 'bg-gradient-to-br from-[#a855f7] to-[#d4ff00]',
  direct: 'bg-gradient-to-br from-[#a855f7] to-[#a855f7]/60',
  mutual: 'bg-gradient-to-br from-[#a855f7] to-[#6366f1]',
};

const BADGE: Record<RelationshipType, { bg: string; text: string; label: string }> = {
  close: { bg: 'bg-[#d4ff00]/15', text: 'text-[#d4ff00]', label: 'Close Friend' },
  direct: { bg: 'bg-[#9333ea]/15', text: 'text-[#c084fc]', label: 'Friend' },
  mutual: { bg: 'bg-[#6366f1]/15', text: 'text-[#818cf8]', label: 'Mutual' },
};

const formatLastSeen = (lastLocationAt: string | null): string => {
  if (!lastLocationAt) return '';
  const mins = (Date.now() - new Date(lastLocationAt).getTime()) / 60000;
  if (mins < 5) return 'Now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  return `${Math.round(mins / 60)}h ago`;
};

/**
 * The Friend ID card (addendum v3 §1 / §11.4 — the original build's card,
 * restored): gradient avatar ring, name, tonight's status, the relationship
 * badge as a control (Close Friend ↔ Friend, Remove with undo; mutual tier
 * shows the shared friends), Hide-my-location in the overflow, distance,
 * friends-also-here, and the original action hierarchy — a large Meet Up
 * (or Make plans when they are not out) plus a separate Chat button.
 * Presented by the /friend-card form sheet everywhere, including the map.
 */
export function FriendCardBody({
  data,
  currentUserId,
  onDismiss,
  friendsAtVenue = [],
  onOpenVenue,
}: {
  data: FriendCardData;
  currentUserId: string;
  /** Close the sheet (router.back) */
  onDismiss: () => void;
  friendsAtVenue?: FriendAtVenue[];
  onOpenVenue?: (venueName: string) => void;
}) {
  const queryClient = useQueryClient();
  const firstName = data.display_name.split(' ')[0];

  // Optimistic local copies of the things the card can change
  const [relationship, setRelationship] = useState<RelationshipType>(data.relationshipType);
  const [hidden, setHidden] = useState(data.locationHidden);
  const [requestPending, setRequestPending] = useState(data.requestPending);
  const [showMutuals, setShowMutuals] = useState(false);
  const [meetUpSent, setMeetUpSent] = useState(false);
  useEffect(() => {
    setRelationship(data.relationshipType);
    setHidden(data.locationHidden);
    setRequestPending(data.requestPending);
    setShowMutuals(false);
    setMeetUpSent(false);
  }, [data.user_id, data.relationshipType, data.locationHidden, data.requestPending]);

  const ring = RING_GRADIENTS[relationship] ?? RING_GRADIENTS.direct;
  const badge = BADGE[relationship];
  const lastSeen = formatLastSeen(data.last_location_at);
  const isOut = data.statusKind === 'out' || data.statusKind === 'party';

  /** Open another person's card: close this sheet first, then push theirs. */
  const switchTo = (userId: string) => {
    onDismiss();
    setTimeout(() => openFriendCard(userId, currentUserId), 300);
  };

  // ── Relationship control ────────────────────────────────────────────
  const changeTier = async (tier: 'close' | 'direct') => {
    if (tier === relationship) return;
    const prev = relationship;
    setRelationship(tier);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setCloseFriend(currentUserId, data.user_id, tier === 'close');
      invalidateFriendGraph(queryClient);
      showToast(tier === 'close' ? `${firstName} added to Close Friends` : `${firstName} moved to Friends`);
    } catch {
      setRelationship(prev);
      showToast('Could not update friend status');
    }
  };

  const confirmRemove = () => {
    Alert.alert(
      `Remove ${data.display_name}?`,
      "They won't be notified, but you'll no longer see each other on the map.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const restore = await removeFriend(currentUserId, data.user_id);
              invalidateFriendGraph(queryClient);
              onDismiss();
              // The sheet is above the root; the toast must wait for it to go
              setTimeout(() => {
                showToast(`Removed ${data.display_name} as a friend`, {
                  action: {
                    label: 'Undo',
                    onPress: async () => {
                      try {
                        await restore();
                        invalidateFriendGraph(queryClient);
                        showToast(`${data.display_name} restored`);
                      } catch {
                        showToast(`Couldn't restore ${data.display_name}`);
                      }
                    },
                  },
                });
              }, 350);
            } catch {
              Alert.alert('Could not remove friend', 'Please try again.');
            }
          },
        },
      ]
    );
  };

  // ── Overflow: privacy ───────────────────────────────────────────────
  const toggleHidden = async () => {
    const next = !hidden;
    setHidden(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setLocationHidden(currentUserId, data.user_id, next);
      showToast(
        next ? `${firstName} can no longer see your location` : `${firstName} can see your location again`
      );
    } catch {
      setHidden(!next);
      showToast('Could not update location privacy');
    }
  };

  const onOverflow = (key: string) => {
    if (key === 'hide') void toggleHidden();
    if (key === 'report') reportContent(currentUserId, { type: 'user', id: data.user_id });
    if (key === 'block') {
      blockUser(currentUserId, data.user_id, data.display_name);
      onDismiss();
    }
  };

  // ── Actions ─────────────────────────────────────────────────────────
  // Meet Up → the original build's confirmation card with confetti, Undo
  // and Chat (addendum v3 §1); the card replaces this sheet.
  const handleMeetUp = async () => {
    if (meetUpSent) return;
    setMeetUpSent(true);
    const result = await sendMeetUp(currentUserId, data);
    if (result.status === 'sent') {
      onDismiss();
      const friends = JSON.stringify([
        { id: data.user_id, display_name: data.display_name, avatar_url: data.avatar_url },
      ]);
      const notificationIds = JSON.stringify(result.notificationId ? [result.notificationId] : []);
      setTimeout(
        () =>
          router.push({
            pathname: '/sent-confirmation',
            params: { kind: 'meetup', friends, notificationIds },
          }),
        350
      );
      return;
    }
    setMeetUpSent(false);
    if (result.status === 'duplicate') {
      onDismiss();
      setTimeout(() => showToast(`You just sent ${firstName} a meet up`), 350);
    }
  };

  const handleMakePlans = () => {
    onDismiss();
    setTimeout(() => router.push('/create-plan'), 300);
  };

  const handleMessage = async () => {
    try {
      const threadId = await createDmThread(data.user_id);
      onDismiss();
      setTimeout(() => {
        router.push({
          pathname: '/thread',
          params: { threadId, title: data.display_name, avatarUrl: data.avatar_url ?? '' },
        });
      }, 250);
    } catch {
      /* demo users / offline — DM stays unavailable */
    }
  };

  const handleFriendRequest = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (requestPending) {
      setRequestPending(false);
      await cancelFriendRequest(currentUserId, data.user_id);
      return;
    }
    setRequestPending(true);
    const ok = await sendFriendRequest(currentUserId, data.user_id);
    if (!ok) setRequestPending(false);
  };

  return (
    <View className="p-5">
      {/* Overflow: privacy + moderation (web card parity) */}
      <View className="absolute right-4 top-4 z-10">
        <DropdownMenu
          options={[
            { key: 'hide', label: hidden ? 'Show my location again' : 'Hide my location' },
            { key: 'report', label: 'Report user' },
            { key: 'block', label: `Block ${firstName}…` },
          ]}
          selectedKey={null}
          onSelect={onOverflow}
          accessibilityLabel="More options"
        >
          <View className="w-7 h-7 rounded-full bg-white/5 items-center justify-center">
            <SymbolView name="ellipsis" size={14} tintColor="rgba(255,255,255,0.5)" />
          </View>
        </DropdownMenu>
      </View>

      {/* Avatar + info row */}
      <View className="flex-row items-center gap-4 mb-4 pr-8">
        <View className={`rounded-full p-[3px] ${ring}`}>
          <View className="rounded-full border-2 border-[#1a0f2e]">
            <Avatar name={data.display_name} url={data.avatar_url} size="lg" />
          </View>
        </View>

        <View className="flex-1 min-w-0">
          <Text className="text-xl font-sans-semibold text-white" numberOfLines={1}>
            {data.display_name}
          </Text>

          {/* Tonight */}
          {data.statusKind === 'out' && data.venue_name ? (
            <>
              <Pressable onPress={() => onOpenVenue?.(data.venue_name)} hitSlop={4}>
                <Text className="text-[#d4ff00] text-sm font-sans-medium" numberOfLines={1}>
                  @{data.venue_name}
                </Text>
              </Pressable>
              <Text className="text-white/45 text-[11px] font-sans">Shared for tonight · clears at 5am</Text>
            </>
          ) : data.statusKind === 'party' ? (
            <>
              <Text className="text-[#d4ff00] text-sm font-sans-medium" numberOfLines={1}>
                Private Party{data.party_neighborhood ? ` (${data.party_neighborhood})` : ''}
              </Text>
              <Text className="text-white/45 text-[11px] font-sans">Shared for tonight · clears at 5am</Text>
            </>
          ) : data.statusLine ? (
            <Text className="text-white/60 text-sm font-sans" numberOfLines={1}>
              {data.statusLine}
            </Text>
          ) : data.username ? (
            <Text className="text-white/45 text-sm font-sans" numberOfLines={1}>
              @{data.username}
            </Text>
          ) : null}

          {/* Relationship badge — a control, as in the original */}
          <View className="flex-row items-center gap-1.5 mt-1">
            {relationship === 'mutual' ? (
              <Pressable
                onPress={() => setShowMutuals((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Mutual friends"
                accessibilityState={{ expanded: showMutuals }}
                className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${badge.bg}`}
              >
                <Text className={`text-[10px] font-sans-semibold uppercase tracking-wide ${badge.text}`}>
                  Mutual Friend
                </Text>
                <SymbolView
                  name={showMutuals ? 'chevron.up' : 'chevron.down'}
                  size={8}
                  tintColor="#818cf8"
                />
              </Pressable>
            ) : (
              <DropdownMenu
                options={[
                  { key: 'close', label: 'Close Friend' },
                  { key: 'direct', label: 'Friend' },
                  { key: 'remove', label: 'Remove friend…' },
                ]}
                selectedKey={relationship}
                onSelect={(key) => {
                  if (key === 'remove') confirmRemove();
                  else void changeTier(key as 'close' | 'direct');
                }}
                accessibilityLabel="Friend status"
              >
                <View className={`flex-row items-center gap-1 px-2 py-0.5 rounded-full ${badge.bg}`}>
                  <Text className={`text-[10px] font-sans-semibold uppercase tracking-wide ${badge.text}`}>
                    {badge.label}
                  </Text>
                  <SymbolView
                    name="chevron.down"
                    size={8}
                    tintColor={relationship === 'close' ? NEON : '#c084fc'}
                  />
                </View>
              </DropdownMenu>
            )}
            {hidden ? (
              <View
                className="flex-row items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15"
                accessibilityLabel={`${data.display_name} can't see your location`}
              >
                <SymbolView name="eye.slash" size={9} tintColor="#fbbf24" />
                <Text className="text-amber-400 text-[9px] font-sans-semibold uppercase tracking-wide">
                  Hidden
                </Text>
              </View>
            ) : null}
          </View>

          {isOut && data.distanceMi !== null ? (
            <Text className="text-white/45 text-xs font-sans mt-0.5">
              {data.distanceMi.toFixed(1)} mi away{lastSeen ? ` · ${lastSeen}` : ''}
            </Text>
          ) : lastSeen && isOut ? (
            <Text className="text-white/45 text-xs font-sans mt-0.5">{lastSeen}</Text>
          ) : null}
        </View>
      </View>

      {/* Mutual friends list (mutual tier, expanded from the badge) */}
      {relationship === 'mutual' && showMutuals ? (
        <View className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-2 gap-1">
          <Text className="text-white/55 text-xs font-sans px-2 pb-1">Mutual friends</Text>
          {data.mutualFriends.length === 0 ? (
            <Text className="text-white/45 text-sm font-sans px-2 pb-1">None yet</Text>
          ) : (
            data.mutualFriends.map((m) => (
              <Pressable
                key={m.user_id}
                onPress={() => switchTo(m.user_id)}
                className="flex-row items-center gap-2 p-2 rounded-xl active:bg-white/10"
              >
                <Avatar name={m.display_name} url={m.avatar_url} size="sm" />
                <Text className="text-white text-sm font-sans-medium flex-1" numberOfLines={1}>
                  {m.display_name}
                </Text>
                <SymbolView name="chevron.right" size={11} tintColor="rgba(255,255,255,0.4)" />
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {/* Actions row — original hierarchy: big Meet Up + separate Chat */}
      <View className="flex-row items-center gap-2">
        {friendsAtVenue.length > 0 ? (
          <DropdownMenu
            options={friendsAtVenue.map((f) => ({ key: f.user_id, label: f.display_name }))}
            selectedKey={null}
            onSelect={switchTo}
            accessibilityLabel="Also here tonight"
          >
            <View className="flex-row items-center">
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
            </View>
          </DropdownMenu>
        ) : null}

        {relationship === 'mutual' ? (
          <Pressable
            onPress={handleFriendRequest}
            accessibilityRole="button"
            className={`h-[42px] px-3.5 rounded-full flex-row items-center gap-1 border ${
              requestPending ? 'border-white/15 active:bg-white/5' : 'border-[#a855f7]/40 active:bg-[#a855f7]/10'
            }`}
          >
            <SymbolView
              name={requestPending ? 'checkmark' : 'person.badge.plus'}
              size={13}
              tintColor={requestPending ? 'rgba(255,255,255,0.4)' : PURPLE}
            />
            <Text
              className="text-[11px] font-sans-medium"
              style={{ color: requestPending ? 'rgba(255,255,255,0.4)' : PURPLE }}
            >
              {requestPending ? 'Requested' : 'Add Friend'}
            </Text>
          </Pressable>
        ) : null}

        {isOut ? (
          <Pressable
            onPress={handleMeetUp}
            accessibilityRole="button"
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
        ) : (
          <Pressable
            onPress={handleMakePlans}
            accessibilityRole="button"
            className="flex-1 h-[42px] rounded-full flex-row items-center justify-center gap-2 border border-[#a855f7]/40 active:bg-[#a855f7]/10"
          >
            <SymbolView name="calendar.badge.plus" size={15} tintColor={PURPLE} />
            <Text className="text-sm font-sans-semibold" style={{ color: PURPLE }}>
              Make plans
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleMessage}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`Chat with ${firstName}`}
          className="w-[42px] h-[42px] rounded-full items-center justify-center border border-white/15 active:bg-white/5"
        >
          <SymbolView name="bubble.left" size={17} tintColor="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>
    </View>
  );
}
