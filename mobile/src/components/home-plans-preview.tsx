import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { usePlans, usePlansRealtime } from '@/hooks/use-plans';
import { useNightMode } from '@/hooks/use-night-mode';
import { formatTimeTo12Hour, splitTonightUpcoming, type Plan } from '@/lib/plans';
import { getNightKey } from '@/lib/tonight';
import { MIST, NEON } from '@/lib/theme';
import { Avatar } from './avatar';
import { ErrorState } from './empty-state';

export function previewPlans(plans: Plan[], nightKey: string) {
  const { tonight, upcoming } = splitTonightUpcoming(plans, p => p.plan_date, nightKey);
  // Keep the Plans feed's score order tonight; upcoming starts with the nearest date.
  return {
    tonight: tonight.length > 0,
    plans: (tonight.length ? tonight : upcoming.sort((a, b) => a.plan_date.localeCompare(b.plan_date))).slice(0, 2),
  };
}

/** A small doorway to the existing, audience-filtered Plans feed, only on empty Home. */
export function HomePlansPreview() {
  const query = usePlans();
  usePlansRealtime();
  const { city } = useNightMode();
  const preview = previewPlans(query.data?.plans ?? [], getNightKey(new Date(), city));
  const openPlans = () => router.push('/messages?tab=plans');
  if (query.isPending) return <View accessibilityLabel="Loading plans" className="mx-4 h-28 rounded-2xl bg-white/5" />;
  if (query.isError && !query.data) return <View className="px-4"><ErrorState compact title="Couldn’t load plans" onRetry={() => { void query.refetch(); }} /></View>;
  if (!preview.plans.length) return <Pressable onPress={openPlans} accessibilityRole="button" accessibilityLabel="Make a plan. Open Plans" className="mx-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 flex-row items-center gap-3 active:opacity-70">
    <SymbolView name="calendar" size={20} tintColor={MIST} />
    <Text className="flex-1 text-white text-sm font-sans-medium">Make a plan</Text>
    <SymbolView name="arrow.up.right" size={14} tintColor={NEON} />
  </Pressable>;
  return <View className="mx-4 rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
    <Pressable accessibilityRole="button" accessibilityLabel="See all plans" onPress={openPlans} className="px-4 min-h-12 flex-row items-center gap-3 active:opacity-70">
      <Text accessibilityRole="header" className="text-white font-sans-semibold text-sm flex-1">{preview.tonight ? 'Tonight’s plans' : 'Coming up'}</Text>
      <Text className="text-white/60 font-sans text-xs">See all</Text>
      <SymbolView name="arrow.up.right" size={12} tintColor={NEON} />
    </Pressable>
    {preview.plans.map(plan => {
      const date = preview.tonight ? '' : new Date(`${plan.plan_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      const detail = [plan.user?.display_name, date, formatTimeTo12Hour(plan.plan_time)].filter(Boolean).join(' · ');
      return <Pressable key={plan.id} accessibilityRole="button" accessibilityLabel={`${plan.venue_name}. ${detail}. Open Plans`} onPress={openPlans} className="px-4 py-3 border-t border-white/5 flex-row items-center gap-3 active:opacity-70">
        <Avatar name={plan.user?.display_name ?? ''} url={plan.user?.avatar_url ?? null} size="sm" />
        <View className="flex-1 min-w-0 gap-1">
          <Text className="text-white font-sans-medium text-sm" numberOfLines={1}>{plan.venue_name}</Text>
          <Text className="text-white/55 font-sans text-xs" numberOfLines={1}>{detail}</Text>
        </View>
        <SymbolView name="chevron.right" size={11} tintColor={MIST} />
      </Pressable>;
    })}
  </View>;
}
