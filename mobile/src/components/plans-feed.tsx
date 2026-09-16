import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { stayIn } from '@/lib/night-status';
import { sendMeetUp } from '@/lib/meet-up';
import { type Plan, type EventWithFriends } from '@/lib/plans';
import { useSession } from '@/hooks/use-session';
import { useFriendsOut, type FriendNightStatus } from '@/hooks/use-friends-out';
import { useMyNightStatus, usePlanEvents, usePlans, usePlansRealtime } from '@/hooks/use-plans';
import { invalidateNightStatusQueries } from '@/hooks/use-own-night-status';
import { Avatar } from '@/components/avatar';
import { PlanCard } from '@/components/plan-card';
import { EventCard } from '@/components/event-card';

const NEON = '#d4ff00';
const PURPLE = '#a855f7';

const AROUND_TONIGHT_COLLAPSE = 4;

type FeedItem = { type: 'plan'; data: Plan } | { type: 'event'; data: EventWithFriends };

/** Web PlansFeed sort: plans by score, events by friend count, 2+-friend events float up. */
function sortFeedItems(a: FeedItem, b: FeedItem): number {
  if (a.type === 'event' && b.type === 'event') {
    return b.data.friendsInterested.length - a.data.friendsInterested.length;
  }
  if (a.type === 'plan' && b.type === 'plan') {
    return b.data.score - a.data.score;
  }
  if (a.type === 'event' && b.type === 'plan') {
    return a.data.friendsInterested.length >= 2 ? -1 : 1;
  }
  if (a.type === 'plan' && b.type === 'event') {
    return b.data.friendsInterested.length >= 2 ? 1 : -1;
  }
  return 0;
}

function SkeletonCard() {
  return (
    <View className="bg-white/[0.06] rounded-2xl p-4 gap-4">
      <View className="flex-row items-center gap-3">
        <View className="w-11 h-11 rounded-full bg-white/10" />
        <View className="flex-1 gap-2">
          <View className="h-4 w-28 rounded-full bg-white/10" />
          <View className="h-3 w-20 rounded-full bg-white/10" />
        </View>
        <View className="h-3 w-12 rounded-full bg-white/10" />
      </View>
      <View className="gap-2">
        <View className="h-4 w-full rounded-full bg-white/10" />
        <View className="h-4 w-3/4 rounded-full bg-white/10" />
      </View>
    </View>
  );
}

interface PlansFeedProps {
  city: string | null;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/**
 * Full Plans tab — port of the web PlansFeed: quiet status control,
 * "Around tonight" centerpiece, then the plans + events feed.
 */
export function PlansFeed({ city, onScroll }: PlansFeedProps) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? '';

  const { data: myStatus } = useMyNightStatus();
  const plansQuery = usePlans();
  const { data: events = [] } = usePlanEvents(city);
  const { data: friendsData } = useFriendsOut();
  usePlansRealtime();

  const [aroundExpanded, setAroundExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // `off` (Stop sharing) is still "out tonight" for the owner — just hidden
  const isUserOut = myStatus?.status === 'out' || myStatus?.status === 'off';
  const isUserPlanning = myStatus?.status === 'planning';

  const refreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['plan-events'] }),
      invalidateNightStatusQueries(queryClient),
    ]);
    setIsRefreshing(false);
  };

  // Out and TBD go through the same Yes/TBD setup as everywhere else (venue,
  // audience, final "Share…" action); No needs no setup and applies directly.
  const handleSwitchToOut = () => router.push('/check-in');
  const handleJoinPlanning = () => router.push({ pathname: '/check-in', params: { step: 'tbd' } });

  const handleStayIn = async () => {
    try {
      await stayIn(userId, { city });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidateNightStatusQueries(queryClient);
    } catch (e) {
      console.error('Error setting staying in:', e);
      Alert.alert('Something went wrong', "Couldn't update your status. Try again.");
    }
  };

  const handleMeetUp = (friend: { user_id: string; display_name: string }) => {
    if (!session) return;
    sendMeetUp(session.user.id, friend);
  };

  const handleEditPlan = (plan: Plan) => {
    router.push({
      pathname: '/edit-plan',
      params: {
        planId: plan.id,
        venueId: plan.venue_id ?? '',
        venueName: plan.venue_name,
        planDate: plan.plan_date,
        planTime: plan.plan_time,
        planType: plan.plan_type ?? '',
        description: plan.description ?? '',
        visibility: plan.visibility,
      },
    });
  };

  const handlePlanDeleted = () => queryClient.invalidateQueries({ queryKey: ['plans'] });

  const plans = plansQuery.data?.plans ?? [];
  const votes = plansQuery.data?.votes ?? {};
  const outFriends = friendsData?.outFriends ?? [];
  const planningFriends = friendsData?.planningFriends ?? [];

  const feedItems: FeedItem[] = [
    ...plans.map((plan) => ({ type: 'plan' as const, data: plan })),
    ...events.map((event) => ({ type: 'event' as const, data: event })),
  ].sort(sortFeedItems);

  // Combined "Around tonight" list: out friends first, then TBD
  const aroundTonight: (FriendNightStatus & { isOut: boolean })[] = [
    ...outFriends.map((f) => ({ ...f, isOut: true })),
    ...planningFriends.map((f) => ({ ...f, isOut: false })),
  ];
  const visibleAround = aroundExpanded
    ? aroundTonight
    : aroundTonight.slice(0, AROUND_TONIGHT_COLLAPSE);
  const hasContent = aroundTonight.length > 0 || feedItems.length > 0;

  return (
    <ScrollView
      contentContainerClassName="px-4 pt-4 pb-28 gap-6"
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refreshAll}
          tintColorClassName="accent-[#d4ff00]"
        />
      }
    >
      {/* 1. Quiet status control */}
      <View className="flex-row items-center gap-3">
        <Text className="text-white/40 text-sm font-sans">You&apos;re</Text>
        <View className="flex-1 flex-row items-center bg-white/[0.04] rounded-full p-1">
          {(
            [
              { label: 'Out', active: isUserOut, onPress: () => !isUserOut && handleSwitchToOut() },
              {
                label: 'TBD',
                active: isUserPlanning,
                onPress: () => !isUserPlanning && handleJoinPlanning(),
              },
              {
                label: 'Staying In',
                active: !isUserPlanning && !isUserOut,
                onPress: () => (isUserPlanning || isUserOut) && handleStayIn(),
              },
            ] as const
          ).map((seg) => (
            <Pressable
              key={seg.label}
              onPress={seg.onPress}
              className={`flex-1 py-2 rounded-full items-center ${seg.active ? 'bg-[#d4ff00]' : ''}`}
            >
              <Text
                className={`text-xs font-sans-semibold ${seg.active ? 'text-black' : 'text-white/40'}`}
              >
                {seg.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {plansQuery.isLoading ? (
        <View className="gap-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : !hasContent ? (
        /* Unified empty state */
        <View className="items-center py-16">
          <View className="w-20 h-20 rounded-full bg-[#2d1b4e]/60 items-center justify-center mb-5">
            <SymbolView name="calendar" size={40} tintColor="rgba(168,85,247,0.6)" />
          </View>
          <Text className="text-xl font-sans-semibold text-white mb-2">Nobody&apos;s out yet</Text>
          <Text className="text-white/40 text-sm font-sans text-center max-w-64 leading-relaxed">
            Be the first — update your status or share a plan.
          </Text>
        </View>
      ) : (
        <>
          {/* 2. Around tonight — weighted centerpiece */}
          {aroundTonight.length > 0 ? (
            <View>
              <View className="flex-row items-baseline justify-between mb-1">
                <Text className="text-white font-sans-semibold text-xl">
                  Around tonight{' '}
                  <Text className="text-white/40 font-sans">· {aroundTonight.length}</Text>
                </Text>
                {aroundTonight.length > AROUND_TONIGHT_COLLAPSE ? (
                  <Pressable onPress={() => setAroundExpanded(!aroundExpanded)} hitSlop={6}>
                    <Text className="text-white/40 text-sm font-sans">
                      {aroundExpanded ? 'Show less' : 'See all'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text className="text-white/30 text-sm font-sans mb-2">
                Friends who are out or down to go
              </Text>

              {visibleAround.map((friend, i) => (
                <View
                  key={friend.user_id}
                  className={`flex-row items-center gap-3 py-3.5 ${
                    i > 0 ? 'border-t border-white/[0.06]' : ''
                  }`}
                >
                  <View
                    className="rounded-full border-2"
                    style={{
                      borderColor: friend.isOut ? 'rgba(212,255,0,0.5)' : 'rgba(168,85,247,0.5)',
                    }}
                  >
                    <Avatar name={friend.display_name} url={friend.avatar_url} size="md" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-white font-sans-semibold text-[15px]" numberOfLines={1}>
                      {friend.display_name}
                    </Text>
                    {friend.isOut ? (
                      <Text className="text-[#d4ff00] text-sm font-sans" numberOfLines={1}>
                        ● Out{friend.venue_name ? ` · ${friend.venue_name}` : ''}
                      </Text>
                    ) : (
                      <Text className="text-[#a855f7] text-sm font-sans" numberOfLines={1}>
                        {friend.planning_venue_name
                          ? `thinking ${friend.planning_venue_name}`
                          : `TBD · ${friend.planning_neighborhood || 'down for anything'}`}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => handleMeetUp(friend)}
                    className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full active:opacity-80 ${
                      friend.isOut ? 'bg-[#d4ff00]' : 'border border-white/20'
                    }`}
                  >
                    <SymbolView
                      name="mappin"
                      size={13}
                      tintColor={friend.isOut ? '#000000' : '#ffffff'}
                    />
                    <Text
                      className={`text-sm font-sans-medium ${
                        friend.isOut ? 'text-black' : 'text-white'
                      }`}
                    >
                      Meet up
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {aroundTonight.length > 0 && feedItems.length > 0 ? (
            <View className="h-px bg-white/[0.08]" />
          ) : null}

          {/* 3. Plans section */}
          <View>
            <Text className="text-white font-sans-semibold text-xl mb-3">Plans</Text>

            {/* Share a plan — lightweight dashed row */}
            <Pressable
              onPress={() => router.push('/create-plan')}
              className="flex-row items-center gap-4 p-4 rounded-2xl border border-dashed border-white/15 mb-4 active:bg-white/[0.02]"
            >
              <View className="w-11 h-11 rounded-full bg-[#d4ff00]/10 items-center justify-center">
                <SymbolView name="plus" size={18} tintColor={NEON} />
              </View>
              <View className="flex-1">
                <Text className="text-white font-sans-medium text-[15px]">Share a plan</Text>
                <Text className="text-white/30 text-xs font-sans mt-0.5">
                  Post when & where — see who&apos;s down
                </Text>
              </View>
            </Pressable>

            <View className="gap-4">
              {feedItems.map((item) =>
                item.type === 'plan' ? (
                  <PlanCard
                    key={`plan-${item.data.id}`}
                    plan={item.data}
                    currentUserId={userId}
                    userVote={votes[item.data.id] ?? null}
                    onEdit={handleEditPlan}
                    onDeleted={handlePlanDeleted}
                  />
                ) : (
                  <EventCard
                    key={`event-${item.data.id}`}
                    event={item.data}
                    currentUserId={userId}
                  />
                )
              )}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
