import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@/components/empty-state';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { RecapCover } from '@/components/recap-cover';
import { PlanCard } from '@/components/plan-card';
import { useNightMode } from '@/hooks/use-night-mode';
import { useNightRecap } from '@/hooks/use-night-recap';
import { usePlans, usePlansRealtime } from '@/hooks/use-plans';
import { useSession } from '@/hooks/use-session';
import { splitTonightUpcoming, type Plan } from '@/lib/plans';
import { getNightKey } from '@/lib/tonight';
import { NEON } from '@/lib/theme';

/** Home's Tonight's-plans preview shows this many; "See all" opens the rest. */
const PREVIEW_PLANS = 2;

/** One compact row with tonight’s opening time. */
function NightCountdownRow() {
  const { opensLabel } = useNightMode();
  return (
    <Pressable onPress={() => router.push('/night-hours')} accessibilityRole="button" accessibilityLabel={`Night Mode opens today at ${opensLabel}`} className="flex-row items-center gap-2.5 min-h-11 px-1 active:opacity-70">
      <SymbolView name="moon.stars" size={15} tintColor={NEON} />
      <Text className="flex-1 text-white/65 text-sm font-sans">Night Mode opens at {opensLabel}</Text>
      <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.5)" />
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
        {tonight.length > 0 ? <Pressable
          onPress={() => router.push('/messages?tab=plans')}
          hitSlop={8}
          accessibilityRole="link"
          className="flex-row items-center gap-1 min-h-11 active:opacity-70"
        >
          <Text className="text-[#d4ff00] text-sm font-sans-medium">See all</Text>
          <SymbolView name="arrow.right" size={12} tintColor={NEON} />
        </Pressable> : null}
      </View>

      {plansQuery.isLoading ? (
        <View className="h-40 rounded-2xl bg-white/[0.06]" />
      ) : plansQuery.isError && !plansQuery.data ? (
        <ErrorState compact title="Couldn’t load plans" body="" onRetry={() => void plansQuery.refetch()} retrying={plansQuery.isRefetching} />
      ) : tonight.length === 0 ? (
        <EmptyState compact icon="calendar" title="Make a night of it" actions={[{ label: 'Make a plan', icon: 'plus', primary: true, onPress: () => router.push('/create-plan') }]} />
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
 * Daytime Home: opening time, an available recap, plans and venue discovery.
 * An empty recap gets one quiet row. At night, Profile links to the recap.
 */
export function DayHome() {
  const { city, isNight } = useNightMode();
  const recap = useNightRecap();
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = usePullToRefresh(async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ['plans'] }), recap.refetch()]);
  });
  return (
    <ScrollView
      contentContainerClassName="px-4 pt-4 pb-36 gap-5"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColorClassName="accent-[#d4ff00]"
        />
      }
    >
      {isNight ? null : <NightCountdownRow />}
      {recap.data ? <RecapCover recap={recap.data} loading={false} /> : null}
      <TonightPlans city={city} />
      <Pressable onPress={() => router.push('/explore')} accessibilityRole="button" className="flex-row items-center gap-3 min-h-14 px-4 py-4 rounded-2xl border border-white/10 bg-white/[0.03] active:opacity-70">
        <SymbolView name="mappin.and.ellipse" size={20} tintColor={NEON} />
        <Text className="flex-1 text-white text-sm font-sans-medium">Find your next spot</Text>
        <SymbolView name="chevron.right" size={12} tintColor="rgba(255,255,255,0.5)" />
      </Pressable>
      {!recap.data ? recap.isError ? (
        <ErrorState compact title="Couldn’t load your recap" body="" onRetry={() => void recap.refetch()} retrying={recap.isRefetching} />
      ) : <RecapCover recap={recap.data} loading={recap.isLoading} /> : null}
    </ScrollView>
  );
}
