import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchPlanParticipants, getPlanExpiry } from '@/lib/plans';
import { fetchProfilesSafe } from '@/lib/profiles';
import { useSession } from '@/hooks/use-session';
import { useDismissKeyboardOnLeave } from '@/hooks/use-dismiss-keyboard-on-leave';
import { PlanForm, type PlanFormValues, type PlanFriend } from '@/components/plan-form';

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

  const [initialFriends, setInitialFriends] = useState<PlanFriend[] | null>(null);

  useEffect(() => {
    if (!params.planId) return;
    let cancelled = false;
    (async () => {
      const [participants, profiles] = await Promise.all([
        fetchPlanParticipants(params.planId),
        fetchProfilesSafe(),
      ]);
      if (cancelled) return;
      setInitialFriends(
        participants.map((p) => ({
          id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          username: profiles.find((pr) => pr.id === p.user_id)?.username ?? '',
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [params.planId]);

  const handleSubmit = async (values: PlanFormValues) => {
    if (!session) return;
    try {
      const { error } = await supabase
        .from('plans')
        .update({
          venue_id: values.venue.id,
          venue_name: values.venue.name,
          plan_date: values.planDate,
          plan_time: values.planTime,
          plan_type: values.planType,
          description: values.description.trim() || null,
          visibility: values.visibility,
          expires_at: getPlanExpiry(values.planDate),
        })
        .eq('id', params.planId)
        .eq('user_id', session.user.id);
      if (error) throw error;

      // Sync participants: delete old, insert new (same as web)
      await supabase.from('plan_participants').delete().eq('plan_id', params.planId);
      if (values.friends.length > 0) {
        await supabase
          .from('plan_participants')
          .insert(values.friends.map((f) => ({ plan_id: params.planId, user_id: f.id })));
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      queryClient.invalidateQueries({ queryKey: ['plan-participants', params.planId] });
      router.back();
    } catch (e) {
      console.error('Error updating plan:', e);
      Alert.alert('Failed to update plan', 'Try again.');
    }
  };

  if (initialFriends === null) {
    return (
      <View className="flex-1 bg-[#110a24] items-center justify-center">
        <ActivityIndicator color="#d4ff00" />
      </View>
    );
  }

  return (
    <PlanForm
      title="Edit Plan"
      submitLabel="Save Changes"
      submittingLabel="Saving..."
      initial={{
        venue: params.venueId
          ? { id: params.venueId, name: params.venueName ?? '', neighborhood: '' }
          : null,
        planDate: params.planDate,
        planTime: params.planTime,
        planType: params.planType || null,
        description: params.description ?? '',
        visibility: params.visibility === 'close_friends' ? 'close_friends' : 'friends',
        friends: initialFriends,
      }}
      onSubmit={handleSubmit}
    />
  );
}
