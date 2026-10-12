import { withholdLivePreview } from '@/lib/live-preview';
import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createResilientChannel } from '@/lib/resilient-channel';
import { supabase } from '@/lib/supabase';
import { buildProfileMap, fetchProfilesSafe } from '@/lib/profiles';
import { useFriendIds } from './use-friend-ids';
import { useOwnNightStatus } from './use-own-night-status';
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

export interface FriendsOutData {
  outFriends: FriendNightStatus[];
  planningFriends: FriendNightStatus[];
  /**
   * True until the viewer participates as TBD or Out. Only aggregate counts
   * are returned; no names, avatars, status rows, or venues.
   */
  venuesWithheld: boolean;
  outCount: number;
  planningCount: number;
}

/**
 * Friends who are out or planning tonight. Visibility (sharing level, hide,
 * block) is enforced server-side by RLS on night_statuses — this hook only
 * shapes authorized identities or count-only data for a nonparticipating viewer.
 */
export function useFriendsOut({ enabled = true }: { enabled?: boolean } = {}) {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const { data: own } = useOwnNightStatus();
  const viewerStayingIn = withholdLivePreview(own?.status?.status, !!own);
  const queryClient = useQueryClient();

  // Realtime: refetch Out/Planning cards whenever any night status changes.
  useEffect(() => {
    if (!session || !enabled) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['friends-out'] });
    return createResilientChannel({
      name: 'night-status-realtime',
      onReconnect: invalidate,
      configure: (ch) =>
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'night_statuses' },
          invalidate
        ),
    });
  }, [session, queryClient, enabled]);

  return useQuery({
    queryKey: ['friends-out', session?.user.id, friendIds, viewerStayingIn],
    enabled: enabled && !!session && !!friendIds,
    staleTime: 30_000,
    // RLS deliberately withholds identity-bearing status events from No viewers.
    // Refresh their aggregate endpoint without widening the realtime audience.
    refetchInterval: viewerStayingIn ? 30_000 : false,
    queryFn: async (): Promise<FriendsOutData> => {
      if (!friendIds || friendIds.length === 0) {
        return { outFriends: [], planningFriends: [], venuesWithheld: viewerStayingIn, outCount: 0, planningCount: 0 };
      }

      if (viewerStayingIn) {
        const { data, error } = await supabase.rpc('get_friends_night_counts');
        if (error) throw error;
        const counts = data as { out?: number; planning?: number } | null;
        return { outFriends: [], planningFriends: [], venuesWithheld: true, outCount: counts?.out ?? 0, planningCount: counts?.planning ?? 0 };
      }
      const [{ data: statuses, error: statusError }, profiles] = await Promise.all([
        supabase
          .from('night_statuses')
          .select('user_id, status, venue_name, planning_neighborhood, planning_venue_name')
          .in('user_id', friendIds)
          .in('status', ['out', 'planning'])
          .gt('expires_at', new Date().toISOString()),
        fetchProfilesSafe(),
      ]);

      if (statusError) throw statusError;
      const profileMap = buildProfileMap(profiles);
      const rows: FriendNightStatus[] = (statuses ?? [])
        .filter((s) => profileMap.has(s.user_id))
        .map((s) => ({
          user_id: s.user_id,
          status: s.status as 'out' | 'planning',
          venue_name: viewerStayingIn ? null : s.venue_name,
          planning_neighborhood: viewerStayingIn ? null : s.planning_neighborhood,
          planning_venue_name: viewerStayingIn ? null : s.planning_venue_name,
          display_name: profileMap.get(s.user_id)!.display_name,
          avatar_url: profileMap.get(s.user_id)!.avatar_url,
        }));

      return {
        outFriends: rows.filter((r) => r.status === 'out'),
        planningFriends: rows.filter((r) => r.status === 'planning'),
        outCount: rows.filter(r => r.status === 'out').length,
        planningCount: rows.filter(r => r.status === 'planning').length,
        venuesWithheld: viewerStayingIn,
      };
    },
  });
}
