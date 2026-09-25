import { ActionSheetIOS, Alert } from 'react-native';
import { supabase } from './supabase';
import { invalidatePrivateViews } from './private-views';
import { queryClient } from './query-client';

/** Same reason values the web ReportDialog writes to the reports table. */
const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Other' },
] as const;

const VENUE_REPORT_REASONS = [
  { value: 'closed', label: 'Permanently closed' },
  { value: 'wrong_location', label: 'Wrong location' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'wrong_info', label: 'Incorrect information' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'other', label: 'Other' },
] as const;

type ReportTarget =
  | { type: 'post'; id: string }
  | { type: 'user'; id: string }
  | { type: 'venue'; id: string };

const REPORT_TITLES = { post: 'Report Post', user: 'Report User', venue: 'Report Venue' };

/** Reason picker → insert into reports. */
export function reportContent(reporterId: string, target: ReportTarget): void {
  const reasons = target.type === 'venue' ? VENUE_REPORT_REASONS : REPORT_REASONS;
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: REPORT_TITLES[target.type],
      message: 'Why are you reporting this?',
      options: [...reasons.map((r) => r.label), 'Cancel'],
      cancelButtonIndex: reasons.length,
    },
    async (index) => {
      const reason = reasons[index]?.value;
      if (!reason) return;
      const { error } = await supabase.from('reports').insert({
        reporter_id: reporterId,
        reason,
        details: null,
        reported_post_id: target.type === 'post' ? target.id : null,
        reported_user_id: target.type === 'user' ? target.id : null,
        reported_venue_id: target.type === 'venue' ? target.id : null,
      });
      Alert.alert(
        error ? 'Report failed' : 'Report submitted',
        error ? error.message : "Thanks — we'll review this content."
      );
    }
  );
}

/**
 * Confirm → block: insert blocked_users and sever the friendship in both
 * directions (mirrors the web FriendIdCard block flow), then refresh the feed
 * so their posts disappear.
 */
export function blockUser(blockerId: string, blockedId: string, blockedName: string): void {
  Alert.alert(
    `Block ${blockedName}?`,
    "They won't see your posts or location, and you won't see theirs.",
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('blocked_users')
            .insert({ blocker_id: blockerId, blocked_id: blockedId });
          if (error && !error.message.includes('duplicate')) {
            Alert.alert('Block failed', error.message);
            return;
          }
          await supabase
            .from('friendships')
            .delete()
            .or(
              `and(user_id.eq.${blockerId},friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},friend_id.eq.${blockerId})`
            );
          await supabase
            .from('close_friends')
            .delete()
            .or(
              `and(user_id.eq.${blockerId},close_friend_id.eq.${blockedId}),and(user_id.eq.${blockedId},close_friend_id.eq.${blockerId})`
            );
          // Friend-list invalidation re-derives the feed without their posts
          invalidatePrivateViews(queryClient);
          Alert.alert(`${blockedName} blocked`);
        },
      },
    ]
  );
}
