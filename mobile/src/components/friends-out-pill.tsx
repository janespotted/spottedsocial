import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { openFriendCard } from '@/lib/friend-card';
import { useFriendsOut, type FriendNightStatus } from '@/hooks/use-friends-out';
import { useSession } from '@/hooks/use-session';
import { Avatar } from '@/components/avatar';
import { INK_LIGHT, NEON } from '@/lib/theme';

type Ring = 'close' | 'friend';
const RING_LABELS: Record<Ring, string> = { close: 'Close Friends', friend: 'Friends' };
const RING_ORDER: Ring[] = ['close', 'friend'];

function statusLine(f: FriendNightStatus, venuesWithheld: boolean): { text: string; lime: boolean } {
  if (f.status === 'out') {
    return { text: venuesWithheld || !f.venue_name ? 'Out' : `At ${f.venue_name}`, lime: true };
  }
  return {
    text: f.planning_venue_name
      ? `thinking ${f.planning_venue_name}`
      : `TBD${f.planning_neighborhood ? ` · ${f.planning_neighborhood}` : ' · down for anything'}`,
    lime: false,
  };
}

/**
 * The original build's "16 out · 5 TBD" pill (addendum v3 §11.1 / §11.3):
 * a compact social-status control in the lower-left of Home and Map that
 * expands into a roster — avatar, name, venue or plan — grouped by ring
 * (Close Friends / Friends) when friends span more than one, with a TBD
 * divider. Tapping a row opens their Friend ID card. Renders nothing while
 * nobody is out or TBD. The parent positions it; the roster opens in a
 * transparent modal anchored above the pill so it can float over a map.
 */
export function FriendsOutPill() {
  const { session } = useSession();
  const { data, isLoading } = useFriendsOut();
  const { data: closeIds } = useQuery({
    queryKey: ['close-friend-ids', session?.user.id],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from('close_friends')
        .select('close_friend_id')
        .eq('user_id', session!.user.id);
      return new Set((rows ?? []).map((r) => r.close_friend_id));
    },
  });
  const triggerRef = useRef<View>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  const outFriends = data?.outFriends ?? [];
  const tbdFriends = data?.planningFriends ?? [];
  if (isLoading || (outFriends.length === 0 && tbdFriends.length === 0)) return null;

  const parts: string[] = [];
  if (outFriends.length > 0) parts.push(`${outFriends.length} out`);
  if (tbdFriends.length > 0) parts.push(`${tbdFriends.length} TBD`);

  const ringOf = (f: FriendNightStatus): Ring => (closeIds?.has(f.user_id) ? 'close' : 'friend');
  const byRing = (list: FriendNightStatus[]) => {
    const groups = new Map<Ring, FriendNightStatus[]>();
    for (const ring of RING_ORDER) {
      const group = list
        .filter((f) => ringOf(f) === ring)
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
      if (group.length > 0) groups.set(ring, group);
    }
    return groups;
  };
  const outByRing = byRing(outFriends);
  const tbdByRing = byRing(tbdFriends);
  const venuesWithheld = data?.venuesWithheld ?? false;

  const open = () => {
    triggerRef.current?.measureInWindow((x, y) => {
      Haptics.selectionAsync();
      setAnchor({ x, y });
    });
  };
  const close = () => setAnchor(null);
  const onRow = (f: FriendNightStatus) => {
    close();
    setTimeout(() => openFriendCard(f.user_id, session?.user.id), 150);
  };

  const listMaxHeight = Math.min(320, anchor ? anchor.y - 60 : 320);

  const Section = ({ title, group }: { title?: string; group: FriendNightStatus[] }) => (
    <View>
      {title ? (
        <View className="px-3 pt-2 pb-1">
          <Text className="text-white/45 text-[10px] font-sans-medium uppercase tracking-wider">
            {title} · {group.length}
          </Text>
        </View>
      ) : null}
      {group.map((f) => {
        const line = statusLine(f, venuesWithheld);
        return (
          <Pressable
            key={f.user_id}
            onPress={() => onRow(f)}
            className="flex-row items-center gap-3 px-3 py-2.5 border-b border-white/5 active:bg-white/5"
          >
            <Avatar name={f.display_name} url={f.avatar_url} size="sm" />
            <View className="flex-1 min-w-0">
              <Text className="text-white text-sm font-sans-medium" numberOfLines={1}>
                {f.display_name}
              </Text>
              <Text
                className="text-xs font-sans"
                style={{ color: line.lime ? NEON : 'rgba(255,255,255,0.45)' }}
                numberOfLines={1}
              >
                {line.text}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${parts.join(', ')} — see who`}
        accessibilityState={{ expanded: !!anchor }}
        className="flex-row items-center gap-2 pl-3.5 pr-3 min-h-9 rounded-full border border-white/10 active:opacity-90"
        style={{ backgroundColor: 'rgba(26, 15, 46, 0.92)' }}
      >
        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: NEON }} />
        <Text className="text-white/85 text-xs font-sans-medium">{parts.join(' · ')}</Text>
        <SymbolView name="chevron.up" size={9} tintColor="rgba(255,255,255,0.4)" />
      </Pressable>

      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close}>
        <Pressable className="flex-1" onPress={close} accessibilityLabel="Close">
          {anchor ? (
            <Animated.View
              entering={FadeIn.duration(140)}
              exiting={FadeOut.duration(100)}
              className="absolute w-72 rounded-2xl border border-white/10 overflow-hidden"
              style={{
                left: anchor.x,
                bottom: windowHeight - anchor.y + 8,
                maxHeight: listMaxHeight,
                backgroundColor: INK_LIGHT,
                shadowColor: '#000',
                shadowOpacity: 0.45,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 8 },
              }}
            >
              <ScrollView bounces={false}>
                {RING_ORDER.map((ring) => {
                  const group = outByRing.get(ring);
                  return group ? (
                    <Section
                      key={`out-${ring}`}
                      title={outByRing.size > 1 ? RING_LABELS[ring] : undefined}
                      group={group}
                    />
                  ) : null;
                })}
                {tbdFriends.length > 0 && outFriends.length > 0 ? (
                  <View className="px-3 py-1.5 bg-white/5 border-y border-white/5">
                    <Text className="text-white/45 text-[10px] font-sans-medium uppercase tracking-wider">
                      TBD tonight · {tbdFriends.length}
                    </Text>
                  </View>
                ) : null}
                {RING_ORDER.map((ring) => {
                  const group = tbdByRing.get(ring);
                  return group ? (
                    <Section
                      key={`tbd-${ring}`}
                      title={tbdByRing.size > 1 ? RING_LABELS[ring] : undefined}
                      group={group}
                    />
                  ) : null;
                })}
              </ScrollView>
            </Animated.View>
          ) : null}
        </Pressable>
      </Modal>
    </>
  );
}
