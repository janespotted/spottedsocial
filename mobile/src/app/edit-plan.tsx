import { usePrivateQuery } from '@/hooks/use-private-query';
import { supabase } from '@/lib/supabase';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { fetchPlanParticipants, savePlan } from '@/lib/plans';
import { fetchProfilesSafe } from '@/lib/profiles';
import { useSession } from '@/hooks/use-session';
import { useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { PlanForm, type PlanFormValues } from '@/components/plan-form';

/**
 * Edit-plan modal. The plan rides in as route params (same fields the web
 * EditPlanDialog receives); existing participants load here.
 */
export default function EditPlanScreen() {
  useDismissKeyboardOnLeave();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    planId: string;
    venueId: string;
    venueName: string;
    planDate: string;
    planTime: string;
    planType: string;
    description: string;
    visibility: string;
  }>();

  const query = usePrivateQuery({
    queryKey: ['edit-plan', params.planId, session?.user.id],
    enabled: !!params.planId && !!session,
    queryFn: async () => {
      const { data: plan, error } = await supabase.from('plans').select('*').eq('id', params.planId).eq('user_id', session!.user.id).maybeSingle();
      if (error) throw error;
      if (!plan) return null;
      const [participants, profiles] = await Promise.all([fetchPlanParticipants(plan.id), fetchProfilesSafe()]);
      return { plan, friends: participants.map(p => ({ id: p.user_id, display_name: p.display_name, avatar_url: p.avatar_url, username: profiles.find(pr => pr.id === p.user_id)?.username ?? '' })) };
    },
  });

  const handleSubmit = async (values: PlanFormValues) => {
    if (!session || !params.planId) return;
    try {
      await savePlan(params.planId, values);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['plan-participants', params.planId] });
      router.back();
    } catch (e) {
      console.error('Error updating plan:', e);
      Alert.alert('Failed to update plan', 'Try again.');
    }
  };

  if (!params.planId || query.isError || query.data === null) return <View className="flex-1 bg-[#110a24] items-center justify-center p-6 gap-4">
    <Text className="text-white">{query.isError ? 'Could not load this plan.' : 'This plan is unavailable or cannot be edited by you.'}</Text>
    {query.isError ? <Text className="text-[#d4ff00]" onPress={() => void query.refetch()}>Retry</Text> : null}
    <Text className="text-white" onPress={() => router.canGoBack() ? router.back() : router.replace('/messages?tab=plans')}>Back to Plans</Text>
  </View>;
  if (!query.data) return <View className="flex-1 items-center justify-center"><ActivityIndicator color="#d4ff00" /></View>;
  const { plan, friends } = query.data;

  return (
    <PlanForm
      title="Edit Plan"
      submitLabel="Save Changes"
      submittingLabel="Saving..."
      initial={{
        venue: plan.venue_id
          ? { id: plan.venue_id, name: plan.venue_name ?? '', neighborhood: '' }
          : null,
        planDate: plan.plan_date,
        planTime: plan.plan_time,
        planType: plan.plan_type || null,
        description: plan.description ?? '',
        visibility: plan.visibility === 'close_friends' ? 'close_friends' : 'friends',
        friends,
      }}
      onSubmit={handleSubmit}
    />
  );
}
