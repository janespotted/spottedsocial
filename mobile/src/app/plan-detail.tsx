import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSession } from '@/hooks/use-session';
import { usePlansRealtime } from '@/hooks/use-plans';
import { useClockMinute } from '@/lib/night-clock';
import { fetchPlan } from '@/lib/plans';
import { editPlanDestination, isUuid } from '@/lib/plan-navigation';
import { PlanCard } from '@/components/plan-card';
import { EmptyState, ErrorState } from '@/components/empty-state';
import { INK_LIGHT, NEON } from '@/lib/theme';

export default function PlanDetail() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const { session } = useSession();
  const now = useClockMinute();
  usePlansRealtime();
  const query = useQuery({ queryKey: ['plan-detail', planId, session?.user.id], enabled: !!session && isUuid(planId),
    refetchOnMount: 'always', staleTime: 0, queryFn: () => fetchPlan(planId!) });
  const plan = query.data;
  const expired = !!plan?.expires_at && new Date(plan.expires_at).getTime() <= now;
  return <KeyboardAwareScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
    <Stack.Screen options={{ headerShown: true, title: 'Plan', headerBackButtonDisplayMode: 'minimal', headerTintColor: '#fff', headerStyle: { backgroundColor: INK_LIGHT } }} />
    {!isUuid(planId) || (!query.isPending && !query.isError && (!plan || expired)) ?
      <EmptyState icon="calendar" title="This plan is no longer available" body="It may have ended, been removed, or its sharing settings changed." actions={[{ label: 'See other plans', onPress: () => router.replace('/messages?tab=plans'), primary: true }, { label: 'Make a plan', onPress: () => router.replace('/create-plan') }]} /> :
      query.isError ? <ErrorState title="Couldn’t load this plan" onRetry={() => void query.refetch()} /> :
      !plan || !session ? <ActivityIndicator color={NEON} /> : <>
        <Text className="text-white/65 text-sm leading-5">Everyone who can see this plan can read and join its chat.</Text>
        <PlanCard key={plan.id} plan={plan} currentUserId={session.user.id} onEdit={p => router.push(editPlanDestination(p))} onDeleted={() => router.replace('/messages?tab=plans')} discussionOpen />
        <Pressable accessibilityRole="button" onPress={() => router.push('/messages?tab=plans')} className="min-h-11 justify-center"><Text style={{ color: NEON }}>See all plans</Text></Pressable>
      </>}
  </KeyboardAwareScrollView>;
}
