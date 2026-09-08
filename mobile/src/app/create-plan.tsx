import { Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getPlanExpiry } from '@/lib/plans';
import { notifyPlanInvites } from '@/lib/notifications';
import { useSession } from '@/hooks/use-session';
import { PlanForm, type PlanFormValues } from '@/components/plan-form';

/** New-plan composer — modal from the Plans tab. Port of the web CreatePlanDialog. */
export default function CreatePlanScreen() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const handleSubmit = async (values: PlanFormValues) => {
    if (!session) return;
    try {
      const { data: plan, error } = await supabase
        .from('plans')
        .insert({
          user_id: session.user.id,
          venue_id: values.venue.id,
          venue_name: values.venue.name,
          plan_date: values.planDate,
          plan_time: values.planTime,
          plan_type: values.planType,
          description: values.description.trim() || null,
          visibility: values.visibility,
          expires_at: getPlanExpiry(values.planDate),
        })
        .select('id')
        .single();
      if (error) throw error;

      if (values.friends.length > 0 && plan) {
        const { error: participantsError } = await supabase
          .from('plan_participants')
          .insert(values.friends.map((f) => ({ plan_id: plan.id, user_id: f.id })));
        if (participantsError) console.error('Error adding participants:', participantsError);

        notifyPlanInvites(
          values.friends.map((f) => f.id),
          session.user.id,
          values.venue.name
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      router.back();
    } catch (e) {
      console.error('Error creating plan:', e);
      Alert.alert('Failed to create plan', 'Try again.');
    }
  };

  return (
    <PlanForm
      title="New Plan"
      submitLabel="Share Plan"
      submittingLabel="Sharing..."
      onSubmit={handleSubmit}
    />
  );
}
