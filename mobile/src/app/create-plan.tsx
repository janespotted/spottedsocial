import { Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { savePlan } from '@/lib/plans';
import { useSession } from '@/hooks/use-session';
import { useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { PlanForm, type PlanFormValues, type PlanFriend } from '@/components/plan-form';

/** New-plan composer — modal from the Plans tab. Port of the web CreatePlanDialog. */
export default function CreatePlanScreen() {
  useDismissKeyboardOnLeave();
  const { session } = useSession();
  const queryClient = useQueryClient();
  // "Make plans" on a friend (Activity, friend card) arrives with them
  // already chosen, so the composer opens with the tag in place.
  const params = useLocalSearchParams<{ withId?: string; withName?: string; withAvatar?: string }>();
  const preselected: PlanFriend[] = params.withId
    ? [
        {
          id: params.withId,
          display_name: params.withName ?? 'Friend',
          avatar_url: params.withAvatar || null,
          username: '',
        },
      ]
    : [];

  const handleSubmit = async (values: PlanFormValues) => {
    if (!session) return;
    try {
      await savePlan(null, values);

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
      initial={{ friends: preselected }}
      onSubmit={handleSubmit}
    />
  );
}
