import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useState } from 'react';
import {
  // Alert — with the parked handleStayIn below
  Pressable,
  RefreshControl,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
// import * as Haptics from 'expo-haptics'; — with the parked handleStayIn below
import { useQueryClient } from '@tanstack/react-query';
// import { stayIn } from '@/lib/night-status'; — with the parked handleStayIn below
import { sendMeetUp } from '@/lib/meet-up';
import { openFriendCard } from '@/lib/friend-card';
import { splitTonightUpcoming, type Plan, type EventWithFriends } from '@/lib/plans';
import { getNightKey } from '@/lib/tonight';
import { useNightMode } from '@/hooks/use-night-mode';
import { useSession } from '@/hooks/use-session';
import { useFriendsOut, type FriendNightStatus } from '@/hooks/use-friends-out';
import { useMyNightStatus, usePlanEvents, usePlans, usePlansRealtime } from '@/hooks/use-plans';
import { invalidateNightStatusQueries } from '@/hooks/use-own-night-status';
import { useFriendIds } from '@/hooks/use-friend-ids';
import { Avatar } from '@/components/avatar';
import { PlanCard } from '@/components/plan-card';
import { EventCard } from '@/components/event-card';
import { EmptyState, ErrorState } from '@/components/empty-state';
import { addFriendsActions } from '@/lib/add-friends';
import { FriendsOutBanner } from '@/components/friends-out-banner';
import { RESET_COPY } from '@/lib/reset-copy';
import { NEON } from '@/lib/theme';

const AROUND_TONIGHT_COLLAPSE = 4;

type FeedItem = { type: 'plan'; data: Plan } | { type: 'event'; data: EventWithFriends };

/** Web PlansFeed sort: plans by score, events by friend count, 2+-friend events float up. */
function sortFeedItems(a: FeedItem, b: FeedItem): number {
  if (a.type === 'event' && b.type === 'event') {
    return b.data.friendsInterested.length - a.data.friendsInterested.length;
  }
  if (a.type === 'plan' && b.type === 'plan') {
    return a.data.plan_date.localeCompare(b.data.plan_date) || a.data.plan_time.localeCompare(b.data.plan_time) || b.data.created_at.localeCompare(a.data.created_at);
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
  const eventsQuery = usePlanEvents(city);
  const events = eventsQuery.data ?? [];
  const { isNight } = useNightMode();
  const friendsOutQuery = useFriendsOut({ enabled: isNight });
  const friendsData = friendsOutQuery.data;
  const friendsQuery = useFriendIds(userId || undefined);
  const friendIds = friendsQuery.data;
  usePlansRealtime();
  // Day plans never start live friend queries.

  const [aroundExpanded, setAroundExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // `off` (Stop sharing) is still "out tonight" for the owner — just hidden
  const isUserOut = myStatus?.status === 'out' || myStatus?.status === 'off';
  const isUserPlanning = myStatus?.status === 'planning';

  const refreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([
      ...['plans', 'plan-downs', 'plan-participants', 'plan-comments'].map(key => queryClient.invalidateQueries({ queryKey: [key] })),
      queryClient.invalidateQueries({ queryKey: ['plan-events'] }),
      queryClient.invalidateQueries({ queryKey: ['friends-out'] }),
      friendsQuery.refetch(),
      invalidateNightStatusQueries(queryClient),
    ]);
    setIsRefreshing(false);
  };

  // Out and TBD go through the same Yes/TBD setup as everywhere else (venue,
  // audience, final "Share…" action); No needs no setup and applies directly.
  const handleSwitchToOut = () => router.push('/check-in');

  /* The segmented status control was removed (client change, Sept 2026), so
     these two lost their only callers. Kept for its return:

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
  */

  /**
   * `sent` shows the confirmation card (sendMeetUp alerts on failure). There
   * is no once-per-night limit: every Meet Up is its own card in the DM.
   */
  const handleMeetUp = async (friend: { user_id: string; display_name: string; avatar_url?: string | null }) => {
    if (!session) return;
    const result = await sendMeetUp(friend);
    if (result.status === 'sent') {
      router.push({
        pathname: '/sent-confirmation',
        params: {
          kind: 'meetup',
          friends: JSON.stringify([
            { id: friend.user_id, display_name: friend.display_name, avatar_url: friend.avatar_url ?? null },
          ]),
          // Undo withdraws the request; Chat opens the thread holding its card
          inviteIds: JSON.stringify([result.inviteId]),
          threadIds: JSON.stringify({ [friend.user_id]: result.threadId }),
        },
      });
    }
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
  const outFriends = friendsData?.outFriends ?? [];
  const planningFriends = friendsData?.planningFriends ?? [];

  const feedItems: FeedItem[] = [
    ...plans.map((plan) => ({ type: 'plan' as const, data: plan })),
    ...events.map((event) => ({ type: 'event' as const, data: event })),
  ].sort(sortFeedItems);
  // Tonight first, then later dates (a plan can be made for any day this week)
  const { tonight: tonightItems, upcoming: upcomingItems } = splitTonightUpcoming(
    feedItems,
    (item) => (item.type === 'plan' ? item.data.plan_date : item.data.event_date),
    getNightKey(new Date(), city)
  );

  // Combined "Around tonight" list: out friends first, then TBD. Live, so
  // Night Mode only.
  const aroundTonight: (FriendNightStatus & { isOut: boolean })[] = isNight
    ? [
        ...outFriends.map((f) => ({ ...f, isOut: true })),
        ...planningFriends.map((f) => ({ ...f, isOut: false })),
      ]
    : [];
  const visibleAround = aroundExpanded
    ? aroundTonight
    : aroundTonight.slice(0, AROUND_TONIGHT_COLLAPSE);
  const hasContent = aroundTonight.length > 0 || feedItems.length > 0;
  const loadFailed = plansQuery.isError || (isNight && friendsOutQuery.isError) || eventsQuery.isError || friendsQuery.isError;
  const friendCount = friendIds?.length ?? 0;
  const venuesWithheld = friendsData?.venuesWithheld ?? false;

  // Status already lives in the header; the empty list needs one next step.
  const emptyState = () => friendCount === 0
    ? { icon: 'person.2' as const, title: 'Find your people', actions: addFriendsActions() }
    : { icon: 'calendar' as const, title: 'No plans yet', actions: [
      { label: 'Make a plan', icon: 'calendar.badge.plus' as const, primary: true, onPress: () => router.push('/create-plan') },
    ] };

  const renderItem = (item: FeedItem) =>
    item.type === 'plan' ? (
      <PlanCard
        key={`plan-${item.data.id}`}
        plan={item.data}
        currentUserId={userId}
        onEdit={handleEditPlan}
        onDeleted={handlePlanDeleted}
      />
    ) : (
      <EventCard key={`event-${item.data.id}`} event={item.data} currentUserId={userId} />
    );

  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      bottomOffset={24}
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
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-white text-2xl font-sans-semibold flex-1">Plans</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/create-plan')} className="min-h-11 px-5 rounded-full bg-[#d4ff00] justify-center"><Text className="text-black font-sans-semibold">New plan</Text></Pressable>
      </View>
      {/* Persistent, compact — meetups and invites go with the night
          (addendum v3 §3). Not a modal, not dismissible. */}
      {isNight ? (
        <View className="flex-row items-center gap-2 px-1">
          <SymbolView name="moon.stars" size={12} tintColor="rgba(255,255,255,0.45)" />
          <Text className="text-white/45 text-xs font-sans flex-1">{RESET_COPY.plansHeader}</Text>
        </View>
      ) : null}

      {/* The Out / TBD / Staying In segmented control used to sit here
          (client change, Sept 2026). Setting a status is the StatusPill's
          job in the header, so Plans no longer duplicates it — the status
          is still READ below for the banner and the empty states. */}

      {/* TBD: surface friends heading out the moment it happens */}
      {isNight && isUserPlanning && outFriends.length > 0 ? (
        <FriendsOutBanner count={outFriends.length} friends={outFriends} />
      ) : null}

      {/* "No" tonight: names only, venues withheld, with the way back in */}
      {isNight && venuesWithheld && aroundTonight.length > 0 ? (
        <Pressable
          onPress={handleSwitchToOut}
          accessibilityRole="button"
          className="flex-row items-center gap-2 rounded-xl px-3 py-2.5 active:opacity-80"
          style={{ backgroundColor: 'rgba(212,255,0,0.08)', borderWidth: 1, borderColor: 'rgba(212,255,0,0.3)' }}
        >
          <Text className="flex-1 text-white/75 text-xs font-sans leading-4">
            Live friend locations are hidden while you’re in.
          </Text>
          <SymbolView name="chevron.right" size={12} tintColor={NEON} />
        </Pressable>
      ) : null}

      {plansQuery.isLoading || (isNight && friendsOutQuery.isLoading) || eventsQuery.isLoading || (!hasContent && friendsQuery.isLoading) ? (
        <View className="gap-5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : loadFailed && !hasContent ? (
        <ErrorState title="Couldn't load tonight's plans" onRetry={refreshAll} retrying={isRefreshing} />
      ) : !hasContent ? (
        (() => {
          const s = emptyState();
          return <EmptyState icon={s.icon} title={s.title} actions={s.actions} />;
        })()
      ) : (
        <>
          {/* 2. Around tonight — weighted centerpiece */}
          {aroundTonight.length > 0 ? (
            <View>
              <View className="flex-row items-baseline justify-between mb-1">
                <Text className="text-white font-sans-semibold text-xl">
                  Around tonight{' '}
                  <Text className="text-white/55 font-sans">· {aroundTonight.length}</Text>
                </Text>
                {aroundTonight.length > AROUND_TONIGHT_COLLAPSE ? (
                  <Pressable onPress={() => setAroundExpanded(!aroundExpanded)} hitSlop={6}>
                    <Text className="text-white/55 text-sm font-sans">
                      {aroundExpanded ? 'Show less' : 'See all'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text className="text-white/45 text-sm font-sans mb-2">
                Friends who are out or down to go
              </Text>

              {visibleAround.map((friend, i) => (
                <View
                  key={friend.user_id}
                  className={`flex-row items-center gap-3 py-3.5 ${
                    i > 0 ? 'border-t border-white/[0.06]' : ''
                  }`}
                >
                  {/* Avatar + name open their friend card, as everywhere else */}
                  <Pressable
                    onPress={() => openFriendCard(friend.user_id, userId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${friend.display_name}'s card`}
                    className="flex-1 min-w-0 flex-row items-center gap-3 active:opacity-70"
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
                          ● Out{friend.venue_name ? ` · ${friend.venue_name}` : venuesWithheld ? ' · venue hidden' : ''}
                        </Text>
                      ) : (
                        <Text className="text-[#a855f7] text-sm font-sans" numberOfLines={1}>
                          {friend.planning_venue_name
                            ? `TBD | ${friend.planning_venue_name}`
                            : `TBD · ${friend.planning_neighborhood || 'down for anything'}`}
                        </Text>
                      )}
                    </View>
                  </Pressable>
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


            <View className="gap-4">
              {tonightItems.length === 0 && upcomingItems.length > 0 ? (
                <Text className="text-white/55 text-sm font-sans px-1">Nothing planned for tonight yet.</Text>
              ) : null}
              {tonightItems.map(renderItem)}
            </View>
          </View>

          {/* 4. Later this week — same cards, same data */}
          {upcomingItems.length > 0 ? (
            <View>
              <Text className="text-white font-sans-semibold text-xl mb-3">Upcoming plans</Text>
              <View className="gap-4">{upcomingItems.map(renderItem)}</View>
            </View>
          ) : null}
        </>
      )}
    </KeyboardAwareScrollView>
  );
}
