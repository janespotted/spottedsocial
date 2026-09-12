import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { queryClient as sharedQueryClient } from '@/lib/query-client';
import { useSession } from './use-session';

/**
 * One shared resilient channel, refcounted across hook instances so two
 * mounted useNotifications() (header badge + Activity screen) share a single
 * websocket subscription.
 */
let notifTeardown: (() => void) | null = null;
let notifChannelUserId: string | null = null;
let notifSubscribers = 0;

function retainNotificationsChannel(userId: string): () => void {
  notifSubscribers++;
  if (notifTeardown && notifChannelUserId !== userId) {
    // Account switched — replace the channel
    notifTeardown();
    notifTeardown = null;
  }
  if (!notifTeardown) {
    notifChannelUserId = userId;
    const invalidate = () =>
      sharedQueryClient.invalidateQueries({ queryKey: ['notifications'] });
    notifTeardown = createResilientChannel({
      name: 'notifications-realtime',
      onReconnect: invalidate,
      configure: (ch) =>
        ch.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `receiver_id=eq.${userId}`,
          },
          invalidate
        ),
    });
  }
  return () => {
    notifSubscribers--;
    if (notifSubscribers <= 0 && notifTeardown) {
      notifTeardown();
      notifTeardown = null;
      notifChannelUserId = null;
    }
  };
}

export interface AppNotification {
  id: string;
  sender_id: string | null;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_name: string | null;
  sender_avatar_url: string | null;
}

/**
 * In-app notifications + unread count, kept live via realtime. Simplified
 * port of the web NotificationsContext (banner/DM plumbing stays web-only).
 */
export function useNotifications() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', session?.user.id],
    enabled: !!session,
    staleTime: 15_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const [{ data: rows }, profiles] = await Promise.all([
        supabase
          .from('notifications')
          .select('id, sender_id, type, message, is_read, created_at')
          .eq('receiver_id', session!.user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        fetchProfilesSafe(),
      ]);
      const profileMap = buildProfileMap(profiles);
      return (rows ?? []).map((n) => ({
        id: n.id,
        sender_id: n.sender_id,
        type: n.type,
        message: n.message,
        is_read: n.is_read ?? false,
        created_at: n.created_at ?? new Date().toISOString(),
        sender_name: n.sender_id ? (profileMap.get(n.sender_id)?.display_name ?? null) : null,
        sender_avatar_url: n.sender_id ? (profileMap.get(n.sender_id)?.avatar_url ?? null) : null,
      }));
    },
  });

  useEffect(() => {
    if (!session) return;
    return retainNotificationsChannel(session.user.id);
  }, [session]);

  const unreadCount = (query.data ?? []).filter((n) => !n.is_read).length;

  const markAllAsRead = async () => {
    if (!session || unreadCount === 0) return;
    // Optimistic: clear the badge immediately
    queryClient.setQueryData<AppNotification[]>(['notifications', session.user.id], (prev) =>
      prev?.map((n) => ({ ...n, is_read: true }))
    );
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('receiver_id', session.user.id)
      .eq('is_read', false);
  };

  return { ...query, unreadCount, markAllAsRead };
}
