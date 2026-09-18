import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { createDmThread } from '@/lib/dm';
import { openFriendCard } from '@/lib/friend-card';
import { acceptMeetUp, acceptVenueInvite } from '@/lib/meet-up';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { useNotifications, type AppNotification } from '@/hooks/use-notifications';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { useSession } from '@/hooks/use-session';
import { getTimeAgo } from '@/hooks/use-feed';
import { Avatar } from '@/components/avatar';
import { NEON, PURPLE, VIOLET_FILL } from '@/lib/theme';

const CARD = 'bg-[#1a0a2e]/80 rounded-2xl p-3.5';

interface PlanningFriend {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  planning_neighborhood: string | null;
  planning_venue_name: string | null;
}

/** "Nadeem wants to meet up with you" → "wants to meet up with you" */
function subtitleFor(n: AppNotification): string {
  const first = n.sender_name?.split(' ')[0];
  if (first && n.message.startsWith(first)) return n.message.slice(first.length).trim();
  return n.message;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-white/50 text-xs font-sans-medium uppercase tracking-wider mt-5 mb-2">
      {title}
    </Text>
  );
}

/** Web ActivityTab card: avatar + bold name + time, typed subtitle, right action */
function ActivityCard({
  n,
  subtitleClass = 'text-white/70',
  action,
}: {
  n: AppNotification;
  subtitleClass?: string;
  action?: { label?: string; icon?: string; onPress: () => void; chevron?: boolean };
}) {
  return (
    <View className={`${CARD} mb-2 flex-row items-center gap-3`}>
      <Pressable
        onPress={() => n.sender_id && openFriendCard(n.sender_id)}
        disabled={!n.sender_id}
        className="active:opacity-70"
      >
        <View className="rounded-full border-2 border-[#a855f7]/60">
          <Avatar name={n.sender_name ?? '•'} url={n.sender_avatar_url} size="md" />
        </View>
      </Pressable>
      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2">
          <Text className="text-white text-sm font-sans-semibold" numberOfLines={1}>
            {n.sender_name ?? 'Spotted'}
          </Text>
          <Text className="text-white/55 text-xs font-sans">{getTimeAgo(n.created_at)}</Text>
        </View>
        <Text className={`text-xs font-sans mt-0.5 ${subtitleClass}`} numberOfLines={2}>
          {subtitleFor(n)}
        </Text>
      </View>
      {action ? (
        action.chevron ? (
          <Pressable onPress={action.onPress} hitSlop={10}>
            <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.35)" />
          </Pressable>
        ) : (
          <Pressable
            onPress={action.onPress}
            className="h-8 px-4 rounded-2xl border border-white/20 items-center justify-center flex-row gap-1 active:bg-white/10"
          >
            {action.icon ? (
              <SymbolView name={action.icon as never} size={12} tintColor="#ffffff" />
            ) : null}
            <Text className="text-white text-xs font-sans-medium">{action.label}</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

/** Sectioned Activity — port of the web messages/ActivityTab. */
export default function ActivityScreen() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const { data: notifications, isLoading, markAllAsRead } = useNotifications();
  const { data: friendIds } = useFriendIds(userId);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    markAllAsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pending friend requests count (web: badge on the top card)
  const { data: pendingCount } = useQuery({
    queryKey: ['friend-requests-count', userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('friend_id', userId!)
        .eq('status', 'pending');
      return count ?? 0;
    },
  });

  // Friends Planning / PGing (live night_statuses, not notifications)
  const { data: planningFriends } = useQuery({
    queryKey: ['planning-friends', userId, friendIds],
    enabled: !!userId && friendIds !== undefined,
    staleTime: 30_000,
    queryFn: async (): Promise<PlanningFriend[]> => {
      if (!friendIds || friendIds.length === 0) return [];
      const [{ data: statuses }, profiles] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('user_id, planning_neighborhood, planning_venue_name')
          .in('user_id', friendIds)
          .eq('status', 'planning')
          .gt('expires_at', new Date().toISOString()),
        fetchProfilesSafe(),
      ]);
      const profileMap = buildProfileMap(profiles);
      return (statuses ?? [])
        .filter((s) => profileMap.has(s.user_id))
        .map((s) => ({
          user_id: s.user_id,
          display_name: profileMap.get(s.user_id)!.display_name,
          avatar_url: profileMap.get(s.user_id)!.avatar_url,
          planning_neighborhood: s.planning_neighborhood,
          planning_venue_name: s.planning_venue_name,
        }));
    },
  });

  const openThreadWith = async (theirId: string, name: string, avatarUrl: string | null) => {
    try {
      const threadId = await createDmThread(theirId);
      router.back();
      setTimeout(
        () =>
          router.push({
            pathname: '/thread',
            params: { threadId, title: name, avatarUrl: avatarUrl ?? '' },
          }),
        250
      );
    } catch {
      /* demo/offline */
    }
  };

  const handleAccept = async (n: AppNotification) => {
    if (!userId || !n.sender_id || busyId) return;
    setBusyId(n.id);
    const threadId =
      n.type === 'venue_invite'
        ? await acceptVenueInvite(userId, n.sender_id, n.id, n.message)
        : await acceptMeetUp(userId, n.sender_id, n.id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setBusyId(null);
    if (threadId) {
      router.back();
      setTimeout(
        () =>
          router.push({
            pathname: '/thread',
            params: { threadId, title: n.sender_name ?? 'Chat', avatarUrl: n.sender_avatar_url ?? '' },
          }),
        250
      );
    }
  };

  // Navigating while this modal is still dismissing makes iOS present the
  // destination as a new modal card on top (the tabs end up inset with
  // rounded corners). Same delay as openThreadWith.
  const goToFriends = () => {
    router.back();
    setTimeout(() => router.push('/friends'), 250);
  };

  /** Plan invites: the plan card carries "I'm down", so land on Plans. */
  const goToPlans = () => {
    router.back();
    setTimeout(() => router.navigate('/'), 250);
  };

  const all = notifications ?? [];
  const invites = all.filter(
    (n) => n.type === 'meetup_request' || n.type === 'venue_invite' || n.type === 'plan_invite'
  );
  const friendRows = all.filter((n) => n.type === 'friend_request' || n.type === 'friend_accepted');
  const accepted = all.filter(
    (n) =>
      n.type === 'meetup_accepted' ||
      n.type === 'venue_invite_accepted' ||
      n.type === 'plan_down'
  );
  const dms = all.filter((n) => n.type === 'dm');
  const engagement = all.filter(
    (n) => n.type.startsWith('post_') || n.type.includes('comment') || n.type === 'like'
  );
  const known = new Set([...invites, ...friendRows, ...accepted, ...dms, ...engagement]);
  const recent = all.filter((n) => !known.has(n));

  return (
    <View className="flex-1 bg-[#110a24]">
      <View className="flex-row items-center justify-between px-4 py-4 border-b border-white/10">
        <Text className="text-white text-base font-sans-semibold">Activity</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <SymbolView name="xmark" size={18} tintColor="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={NEON} />
        </View>
      ) : (
        <ScrollView contentContainerClassName="px-4 pt-4 pb-safe-offset-6">
          {/* Friend Requests — always at top (web parity) */}
          <Pressable
            onPress={goToFriends}
            className={`${CARD} flex-row items-center justify-between active:opacity-80`}
          >
            <View className="flex-row items-center gap-3">
              <View className="w-11 h-11 rounded-full bg-white/5 items-center justify-center">
                <SymbolView name="person.badge.plus" size={20} tintColor={NEON} />
              </View>
              <View>
                <Text className="text-white text-[15px] font-sans-semibold">Friend Requests</Text>
                <Text className="text-white/60 text-xs font-sans mt-0.5">
                  {pendingCount
                    ? `${pendingCount} pending request${pendingCount > 1 ? 's' : ''}`
                    : 'Find and add friends'}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              {pendingCount ? (
                <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PURPLE }} />
              ) : null}
              <SymbolView name="chevron.right" size={13} tintColor="rgba(255,255,255,0.35)" />
            </View>
          </Pressable>

          {/* Friends Planning / PGing */}
          {planningFriends?.length ? (
            <View className="mt-5">
              <View className="flex-row items-center gap-2 mb-2">
                <SymbolView name="scope" size={14} tintColor={PURPLE} />
                <Text className="text-white text-sm font-sans-semibold">
                  Friends Planning / PGing
                </Text>
                <Text className="text-white/55 text-xs font-sans">
                  {planningFriends.length} deciding
                </Text>
              </View>
              {planningFriends.map((f) => (
                <View key={f.user_id} className={`${CARD} mb-2 flex-row items-center gap-3`}>
                  <Pressable onPress={() => openFriendCard(f.user_id, userId)} className="active:opacity-70">
                    <View className="rounded-full border-2 border-[#a855f7]/60">
                      <Avatar name={f.display_name} url={f.avatar_url} size="md" />
                    </View>
                  </Pressable>
                  <View className="flex-1 min-w-0">
                    <Text className="text-white text-sm font-sans-medium" numberOfLines={1}>
                      {f.display_name}
                    </Text>
                    <Text className="text-[#a855f7] text-xs font-sans mt-0.5" numberOfLines={1}>
                      {f.planning_venue_name
                        ? `thinking ${f.planning_venue_name}`
                        : f.planning_neighborhood
                          ? `TBD · ${f.planning_neighborhood}`
                          : 'TBD · down for anything'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => openThreadWith(f.user_id, f.display_name, f.avatar_url)}
                    className="h-8 px-4 rounded-full items-center justify-center active:opacity-90"
                    style={{ backgroundColor: VIOLET_FILL, boxShadow: '0 0 12px rgba(168,85,247,0.5)' }}
                  >
                    <Text className="text-white text-xs font-sans-semibold">Make plans</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {/* Activity */}
          <Text className="text-white text-2xl font-sans-semibold mt-6">Activity</Text>

          <SectionHeader title="Invites to You" />
          {invites.length ? (
            invites.map((n) => (
              <ActivityCard
                key={n.id}
                n={n}
                subtitleClass={
                  n.type === 'venue_invite' || n.type === 'plan_invite'
                    ? 'text-[#d4ff00]'
                    : 'text-white/70'
                }
                action={
                  // A plan invite has nothing to accept here — "I'm down"
                  // lives on the plan card itself, so open Plans.
                  n.type === 'plan_invite'
                    ? { label: 'See plan', onPress: goToPlans }
                    : {
                        label: busyId === n.id ? '...' : "I'm down!",
                        onPress: () => handleAccept(n),
                      }
                }
              />
            ))
          ) : (
            <Text className="text-white/50 text-sm font-sans py-2">
              No invites yet — they&apos;ll land here.
            </Text>
          )}

          {friendRows.length ? (
            <>
              <SectionHeader title="Friend Requests" />
              {friendRows.map((n) => (
                <ActivityCard
                  key={n.id}
                  n={n}
                  subtitleClass={n.type === 'friend_accepted' ? 'text-[#d4ff00]' : 'text-white/70'}
                  action={{ chevron: true, onPress: goToFriends }}
                />
              ))}
            </>
          ) : null}

          {accepted.length ? (
            <>
              <SectionHeader title="Accepted Invites" />
              {accepted.map((n) => (
                <ActivityCard
                  key={n.id}
                  n={n}
                  subtitleClass="text-[#d4ff00]"
                  action={{
                    label: 'Chat',
                    icon: 'bubble.left',
                    onPress: () =>
                      n.sender_id &&
                      openThreadWith(n.sender_id, n.sender_name ?? 'Chat', n.sender_avatar_url),
                  }}
                />
              ))}
            </>
          ) : null}

          {dms.length ? (
            <>
              <SectionHeader title="Messages" />
              {dms.map((n) => (
                <ActivityCard
                  key={n.id}
                  n={n}
                  action={{
                    label: 'View',
                    onPress: () => {
                      router.back();
                      setTimeout(() => router.push('/messages'), 250);
                    },
                  }}
                />
              ))}
            </>
          ) : null}

          {engagement.length ? (
            <>
              <SectionHeader title="Post Engagement" />
              {engagement.map((n) => (
                <ActivityCard key={n.id} n={n} />
              ))}
            </>
          ) : null}

          {recent.length ? (
            <>
              <SectionHeader title="Recent" />
              {recent.map((n) => (
                <ActivityCard key={n.id} n={n} />
              ))}
            </>
          ) : null}

          {all.length === 0 && !planningFriends?.length ? (
            <View className="items-center py-16 gap-3">
              <SymbolView name="bell" size={32} tintColor="rgba(255,255,255,0.2)" />
              <Text className="text-white/55 text-sm font-sans">
                Nothing yet — go make some noise.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
