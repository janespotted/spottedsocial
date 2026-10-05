import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarHeart, CalendarPlus, Martini, PartyPopper } from 'lucide-react-native';
import { DayPlaceholder } from '@/components/day-placeholder';
import { RecapCover } from '@/components/recap-cover';
import { PlanCard } from '@/components/plan-card';
import { useCountdown, useNightMode } from '@/hooks/use-night-mode';
import { useNightRecap } from '@/hooks/use-night-recap';
import { usePlans, usePlansRealtime } from '@/hooks/use-plans';
import { useSession } from '@/hooks/use-session';
import { splitTonightUpcoming, type Plan } from '@/lib/plans';
import { getNightKey } from '@/lib/tonight';
import { dayRaised, NEON } from '@/lib/theme';

/** Home's Tonight's-plans preview shows this many; "See all" opens the rest. */
const PREVIEW_PLANS = 2;

/** One compact row: when Night Mode opens and how long until it does. */
function NightCountdownRow() {
  const { opensAt, opensLabel } = useNightMode();
  const { hours, minutes } = useCountdown(opensAt);
  return (
    <Pressable
      onPress={() => router.push('/night-hours')}
      accessibilityRole="button"
      accessibilityLabel={`Night Mode opens today at ${opensLabel}, in ${Number(hours)} hours ${Number(minutes)} minutes`}
      className={`flex-row items-center justify-between rounded-2xl px-4 py-3.5 active:opacity-85 ${dayRaised}`}
    >
      <View className="flex-row items-center gap-2.5">
        <SymbolView name="moon.stars" size={17} tintColor={NEON} />
        <View>
          <Text className="text-white text-sm font-sans-medium">Night Mode</Text>
          <Text className="text-white/60 text-xs font-sans mt-0.5">Today at {opensLabel}</Text>
        </View>
      </View>
      <Text className="text-[#d4ff00]" style={{ fontVariant: ['tabular-nums'] }}>
        <Text className="text-2xl font-sans-medium">{hours}</Text>
        <Text className="text-xs font-sans">h </Text>
        <Text className="text-2xl font-sans-medium">{minutes}</Text>
        <Text className="text-xs font-sans">m</Text>
      </Text>
    </Pressable>
  );
}

/**
 * Tonight's plans on Home: the SAME query (`['plans', uid]`) and the same
 * PlanCard as Chat → Plans, so a vote, "I'm down" or comment here is the one
 * in Plans too (client brief §2).
 */
function TonightPlans({ city }: { city: string }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? '';
  const plansQuery = usePlans();
  usePlansRealtime();
  const { tonight } = splitTonightUpcoming(
    plansQuery.data?.plans ?? [],
    (p) => p.plan_date,
    getNightKey(new Date(), city)
  );
  const votes = plansQuery.data?.votes ?? {};

  const editPlan = (plan: Plan) =>
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

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-white text-lg font-sans-semibold" accessibilityRole="header">
          Tonight&apos;s plans
        </Text>
        <Pressable
          onPress={() => router.push('/messages?tab=plans')}
          hitSlop={8}
          accessibilityRole="link"
          className="flex-row items-center gap-1 min-h-11 active:opacity-70"
        >
          <Text className="text-[#d4ff00] text-sm font-sans-medium">See all</Text>
          <SymbolView name="arrow.right" size={12} tintColor={NEON} />
        </Pressable>
      </View>

      {plansQuery.isLoading ? (
        <View className="h-40 rounded-2xl bg-white/[0.06]" />
      ) : tonight.length === 0 ? (
        <DayPlaceholder
          icons={[Martini, CalendarHeart, PartyPopper]}
          title="What’s the plan tonight?"
          body="Pick a spot and a time — friends can say they’re down."
          action={{ label: 'Share a plan', icon: CalendarPlus, onPress: () => router.push('/create-plan') }}
        />
      ) : (
        tonight.slice(0, PREVIEW_PLANS).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentUserId={userId}
            userVote={votes[plan.id] ?? null}
            onEdit={editPlan}
            onDeleted={() => queryClient.invalidateQueries({ queryKey: ['plans'] })}
          />
        ))
      )}

      {tonight.length > 0 ? (
        <Pressable
          onPress={() => router.push('/create-plan')}
          accessibilityRole="button"
          className="self-start flex-row items-center gap-1.5 min-h-11 active:opacity-70"
        >
          <SymbolView name="plus" size={14} tintColor={NEON} />
          <Text className="text-[#d4ff00] text-[15px] font-sans-medium">Share a plan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Home in Day Mode, "Morning After" tab (client brief §2), in the brief's
 * order: the countdown, the Morning After card, tonight's plans. Kept light —
 * one heading, no explanations; detail is behind taps.
 */
export function DayHome() {
  const { city } = useNightMode();
  const recap = useNightRecap();
  const queryClient = useQueryClient();
  return (
    <ScrollView
      contentContainerClassName="px-4 pt-4 pb-36 gap-5"
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: ['plans'] });
            void recap.refetch();
          }}
          tintColorClassName="accent-[#d4ff00]"
        />
      }
    >
      <NightCountdownRow />
      <RecapCover recap={recap.data} loading={recap.isLoading} />
      <TonightPlans city={city} />
    </ScrollView>
  );
}
