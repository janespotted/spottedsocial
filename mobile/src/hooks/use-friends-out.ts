import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { useFriendIds } from './use-friend-ids';
import { useSession } from './use-session';

export interface FriendNightStatus {
  user_id: string;
  status: 'out' | 'planning';
  venue_name: string | null;
  planning_neighborhood: string | null;
  planning_venue_name: string | null;
  display_name: string;
  avatar_url: string | null;
}

/**
 * Friends who are out or planning tonight. Visibility (sharing level, hide,
 * block) is enforced server-side by RLS on night_statuses — this hook only
 * shapes the data.
 */
export function useFriendsOut() {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const queryClient = useQueryClient();

  // Realtime: refetch Out/Planning cards whenever any night status changes.
  // Channel topic must be unique per mount — supabase.channel() returns the
  // existing instance for a repeated name, and adding callbacks to an
  // already-subscribed channel throws when the hook is used on two screens.
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`night-status-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'night_statuses' },
        () => queryClient.invalidateQueries({ queryKey: ['friends-out'] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, queryClient]);

  return useQuery({
    queryKey: ['friends-out', session?.user.id, friendIds],
    enabled: !!session && !!friendIds,
    staleTime: 30_000,
    queryFn: async () => {
      if (!friendIds || friendIds.length === 0) {
        return { outFriends: [], planningFriends: [] };
      }

      const [{ data: statuses }, profiles] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('user_id, status, venue_name, planning_neighborhood, planning_venue_name')
          .in('user_id', friendIds)
          .in('status', ['out', 'planning'])
          .gt('expires_at', new Date().toISOString()),
        fetchProfilesSafe(),
      ]);

      const profileMap = buildProfileMap(profiles);
      const rows: FriendNightStatus[] = (statuses ?? [])
        .filter((s) => profileMap.has(s.user_id))
        .map((s) => ({
          user_id: s.user_id,
          status: s.status as 'out' | 'planning',
          venue_name: s.venue_name,
          planning_neighborhood: s.planning_neighborhood,
          planning_venue_name: s.planning_venue_name,
          display_name: profileMap.get(s.user_id)!.display_name,
          avatar_url: profileMap.get(s.user_id)!.avatar_url,
        }));

      return {
        outFriends: rows.filter((r) => r.status === 'out'),
        planningFriends: rows.filter((r) => r.status === 'planning'),
      };
    },
  });
}
