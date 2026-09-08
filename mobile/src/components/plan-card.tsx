import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  PLAN_TYPES,
  deletePlan,
  fetchPlanComments,
  fetchPlanDowns,
  fetchPlanParticipants,
  formatTimeTo12Hour,
  getSmartDateLabel,
  votePlan,
  type Plan,
  type PlanComment,
} from '@/lib/plans';
import { notifyPlanDown } from '@/lib/notifications';
import { validateCommentText } from '@/lib/validation';
import { getTimeAgo } from '@/hooks/use-feed';
import { Avatar } from '@/components/avatar';

const NEON = '#d4ff00';

/** Overlapping avatar strip ("going with" / "N down"). */
function AvatarStack({
  people,
  max = 5,
}: {
  people: { user_id: string; display_name: string; avatar_url: string | null }[];
  max?: number;
}) {
  return (
    <View className="flex-row">
      {people.slice(0, max).map((p, i) => (
        <View
          key={p.user_id}
          className="rounded-full border-2 border-[#110a24]"
          style={{ marginLeft: i === 0 ? 0 : -8 }}
        >
          <Avatar name={p.display_name} url={p.avatar_url} size="sm" />
        </View>
      ))}
      {people.length > max ? (
        <View
          className="w-8 h-8 rounded-full bg-[#a855f7]/20 border-2 border-[#110a24] items-center justify-center"
          style={{ marginLeft: -8 }}
        >
          <Text className="text-[#a855f7] text-[10px] font-sans-medium">
            +{people.length - max}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface PlanCardProps {
  plan: Plan;
  currentUserId: string;
  userVote: 'up' | 'down' | null;
  onEdit: (plan: Plan) => void;
  onDeleted: (planId: string) => void;
}

/** Port of the web PlanItem: votes, "I'm down", inline comments, owner actions. */
export function PlanCard({ plan, currentUserId, userVote, onEdit, onDeleted }: PlanCardProps) {
  const queryClient = useQueryClient();
  const isOwner = plan.user_id === currentUserId;

  const [isVoting, setIsVoting] = useState(false);
  const [isTogglingDown, setIsTogglingDown] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PlanComment[] | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [showDownList, setShowDownList] = useState(false);

  const { data: downs = [] } = useQuery({
    queryKey: ['plan-downs', plan.id],
    queryFn: () => fetchPlanDowns(plan.id),
    staleTime: 30_000,
  });
  const { data: participants = [] } = useQuery({
    queryKey: ['plan-participants', plan.id],
    queryFn: () => fetchPlanParticipants(plan.id),
    staleTime: 30_000,
  });
  const isDown = downs.some((d) => d.user_id === currentUserId);

  const refreshPlans = () => queryClient.invalidateQueries({ queryKey: ['plans'] });
  const refreshDowns = () => queryClient.invalidateQueries({ queryKey: ['plan-downs', plan.id] });

  const handleVote = async (voteType: 'up' | 'down') => {
    if (isVoting) return;
    setIsVoting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await votePlan(plan.id, currentUserId, voteType, userVote);
      refreshPlans();
    } catch (e) {
      console.error('Error voting:', e);
    } finally {
      setIsVoting(false);
    }
  };

  const handleToggleDown = async () => {
    if (isTogglingDown) return;
    setIsTogglingDown(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isDown) {
        await supabase
          .from('plan_downs')
          .delete()
          .eq('plan_id', plan.id)
          .eq('user_id', currentUserId);
      } else {
        await supabase.from('plan_downs').insert({ plan_id: plan.id, user_id: currentUserId });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        notifyPlanDown(plan, currentUserId);
      }
      refreshDowns();
    } catch (e) {
      console.error('Error toggling down:', e);
    } finally {
      setIsTogglingDown(false);
    }
  };

  const handleToggleComments = async () => {
    if (!showComments && comments === null) {
      setShowComments(true);
      setComments(await fetchPlanComments(plan.id));
    } else {
      setShowComments(!showComments);
    }
  };

  const handlePostComment = async () => {
    const validation = validateCommentText(newComment);
    if (!validation.success || isPostingComment) return;
    setIsPostingComment(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { error } = await supabase
        .from('plan_comments')
        .insert({ plan_id: plan.id, user_id: currentUserId, text: validation.data! });
      if (!error) {
        setNewComment('');
        setComments(await fetchPlanComments(plan.id));
        refreshPlans(); // comments_count lives on the plan row
      }
    } finally {
      setIsPostingComment(false);
    }
  };

  const openOwnerMenu = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Edit Plan', 'Delete Plan', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (index) => {
        if (index === 0) onEdit(plan);
        if (index === 1) {
          Alert.alert('Delete this plan?', 'This action cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deletePlan(plan.id, currentUserId);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDeleted(plan.id);
                } catch (e) {
                  console.error('Error deleting plan:', e);
                  Alert.alert('Failed to delete plan', 'Try again.');
                }
              },
            },
          ]);
        }
      }
    );
  };

  const openVenue = () => {
    if (plan.venue_id) router.push({ pathname: '/venue', params: { venueId: plan.venue_id } });
  };

  const planTypeInfo = plan.plan_type
    ? PLAN_TYPES.find((t) => t.value === plan.plan_type)
    : null;
  const isCloseFriends = plan.visibility === 'close_friends';

  return (
    <View className="bg-white/[0.06] rounded-2xl p-4">
      {/* Plan type badge */}
      {planTypeInfo ? (
        <View className="flex-row mb-2">
          <View className="bg-[#d4ff00]/15 rounded-lg px-2.5 py-1">
            <Text className="text-[#d4ff00] text-[11px] font-sans-semibold tracking-wide">
              {planTypeInfo.emoji} {planTypeInfo.label.toUpperCase()}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Header */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-row items-center gap-3 shrink">
          <Avatar name={plan.user?.display_name ?? '?'} url={plan.user?.avatar_url ?? null} size="md" />
          <View className="shrink">
            <Text className="text-white font-sans-semibold text-base" numberOfLines={1}>
              {plan.user?.display_name}
            </Text>
            <View className="flex-row items-center gap-1">
              <SymbolView
                name={isCloseFriends ? 'lock.fill' : 'person.2.fill'}
                size={11}
                tintColor="rgba(255,255,255,0.6)"
              />
              <Text className="text-white/60 text-xs font-sans">
                {isCloseFriends ? 'Close Friends' : 'Friends'}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-start gap-2 pl-2">
          <View className="items-end">
            <Pressable onPress={openVenue} className="flex-row items-center gap-1.5 active:opacity-70">
              <SymbolView name="mappin" size={13} tintColor="rgba(255,255,255,0.5)" />
              <Text className="text-[#d4ff00] font-sans-semibold text-base" numberOfLines={1}>
                {plan.venue_name}
              </Text>
            </Pressable>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              <SymbolView name="calendar" size={11} tintColor="rgba(255,255,255,0.5)" />
              <Text className="text-white text-xs font-sans-semibold">
                {getSmartDateLabel(plan.plan_date)}
              </Text>
              <SymbolView name="clock" size={11} tintColor="rgba(255,255,255,0.5)" />
              <Text className="text-white/70 text-xs font-sans">
                {formatTimeTo12Hour(plan.plan_time)}
              </Text>
            </View>
          </View>
          {isOwner ? (
            <Pressable onPress={openOwnerMenu} hitSlop={8} className="opacity-60 pt-1">
              <SymbolView name="ellipsis" size={16} tintColor="rgba(255,255,255,0.8)" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Description */}
      {plan.description ? (
        <Text className="text-white text-sm font-sans leading-relaxed mb-3">
          {plan.description}
        </Text>
      ) : null}

      {/* Going with */}
      {participants.length > 0 ? (
        <View className="flex-row items-center gap-2 mb-3">
          <Text className="text-white/40 text-xs font-sans">Going with</Text>
          <AvatarStack people={participants} />
        </View>
      ) : null}

      {participants.length === 0 && downs.length === 0 ? (
        <Text className="text-white/30 text-xs font-sans mb-3">Nobody&apos;s joined yet</Text>
      ) : null}

      {/* I'm down pill + down count */}
      <View className="flex-row items-center gap-2 mb-3">
        {!isOwner ? (
          <Pressable
            onPress={handleToggleDown}
            disabled={isTogglingDown}
            className={`flex-row items-center rounded-xl px-3 py-1.5 active:opacity-80 ${
              isDown ? 'bg-[#bfe600]' : 'bg-[#a855f7]/20'
            }`}
          >
            <Text
              className={`text-xs font-sans-semibold ${isDown ? 'text-black' : 'text-[#a855f7]'}`}
            >
              {isDown ? "You're down!" : "I'm down!"}
            </Text>
          </Pressable>
        ) : null}

        {downs.length > 0 ? (
          <Pressable
            onPress={() => setShowDownList(!showDownList)}
            className="flex-row items-center gap-1.5 rounded-xl px-2.5 py-1.5 bg-[#a855f7]/10 active:opacity-80"
          >
            <AvatarStack people={downs} max={3} />
            <Text className="text-[#a855f7] text-xs font-sans-semibold">{downs.length} down</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Who's down — inline expansion (web uses a popup) */}
      {showDownList && downs.length > 0 ? (
        <View className="rounded-xl bg-white/5 p-3 mb-3 gap-2.5">
          {downs.map((down) => (
            <View key={down.user_id} className="flex-row items-center gap-3">
              <Avatar name={down.display_name} url={down.avatar_url} size="sm" />
              <Text className="text-white text-sm font-sans-medium">{down.display_name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Footer: comments + votes */}
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={handleToggleComments}
          hitSlop={8}
          className="flex-row items-center gap-1.5 opacity-60 active:opacity-100"
        >
          <SymbolView name="bubble.right" size={16} tintColor="rgba(255,255,255,0.8)" />
          <Text className="text-white/80 text-sm font-sans">{plan.comments_count || 0}</Text>
        </Pressable>

        <View className="flex-row items-center bg-black/30 rounded-xl px-1">
          <Pressable
            onPress={() => handleVote('up')}
            disabled={isVoting}
            hitSlop={6}
            className={`w-9 h-9 items-center justify-center rounded-lg ${
              userVote === 'up' ? 'bg-[#d4ff00]/10' : ''
            }`}
          >
            <SymbolView
              name="chevron.up"
              size={16}
              tintColor={userVote === 'up' ? NEON : 'rgba(255,255,255,0.5)'}
            />
          </Pressable>
          <Text
            className={`text-sm font-sans-semibold min-w-6 text-center ${
              plan.score > 0
                ? 'text-[#d4ff00]'
                : plan.score < 0
                  ? 'text-red-400'
                  : 'text-white/50'
            }`}
          >
            {plan.score}
          </Text>
          <Pressable
            onPress={() => handleVote('down')}
            disabled={isVoting}
            hitSlop={6}
            className={`w-9 h-9 items-center justify-center rounded-lg ${
              userVote === 'down' ? 'bg-red-500/10' : ''
            }`}
          >
            <SymbolView
              name="chevron.down"
              size={16}
              tintColor={userVote === 'down' ? '#f87171' : 'rgba(255,255,255,0.5)'}
            />
          </Pressable>
        </View>
      </View>

      {/* Comments */}
      {showComments ? (
        <View className="mt-4 pt-4 border-t border-white/10 gap-3">
          {comments === null ? (
            <ActivityIndicator color={NEON} />
          ) : comments.length === 0 ? (
            <Text className="text-white/40 text-sm font-sans text-center py-1">
              No comments yet
            </Text>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} className="flex-row gap-2">
                <Avatar name={comment.display_name} url={comment.avatar_url} size="sm" />
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-white text-sm font-sans-medium">
                      {comment.display_name}
                    </Text>
                    <Text className="text-white/40 text-xs font-sans">
                      {getTimeAgo(comment.created_at)}
                    </Text>
                  </View>
                  <Text className="text-white/80 text-sm font-sans">{comment.text}</Text>
                </View>
              </View>
            ))
          )}

          <View className="flex-row gap-2 pt-1">
            <TextInput
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Add a comment..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              className="flex-1 h-9 px-3 rounded-xl bg-black/30 text-white text-sm font-sans"
              onSubmitEditing={handlePostComment}
              returnKeyType="send"
            />
            <Pressable
              onPress={handlePostComment}
              disabled={!newComment.trim() || isPostingComment}
              className={`h-9 px-3 rounded-xl items-center justify-center bg-[#a855f7] ${
                !newComment.trim() || isPostingComment ? 'opacity-40' : 'active:opacity-80'
              }`}
            >
              <SymbolView name="paperplane.fill" size={14} tintColor="#ffffff" />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
