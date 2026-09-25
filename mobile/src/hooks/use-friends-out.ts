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
   * True when the viewer answered "No" tonight: friends are listed, but
   * their venues are withheld (aggregate cues only, like the map) until
   * the viewer updates their status.
   */
  venuesWithheld: boolean;
}

/**
 * Friends who are out or planning tonight. Visibility (sharing level, hide,
 * block) is enforced server-side by RLS on night_statuses — this hook only
 * shapes the data, plus the one client-side rule that a viewer who is
 * staying in does not see precise venues (client feedback §8).
 */
export function useFriendsOut() {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  const { data: own } = useOwnNightStatus();
  const viewerStayingIn = withholdLivePreview(own?.status?.status, !!own);
  const queryClient = useQueryClient();

  // Realtime: refetch Out/Planning cards whenever any night status changes.
  useEffect(() => {
    if (!session) return;
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
  }, [session, queryClient]);

  return useQuery({
    queryKey: ['friends-out', session?.user.id, friendIds, viewerStayingIn],
    enabled: !!session && !!friendIds,
    staleTime: 30_000,
    queryFn: async (): Promise<FriendsOutData> => {
      if (!friendIds || friendIds.length === 0) {
        return { outFriends: [], planningFriends: [], venuesWithheld: false };
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
        venuesWithheld: viewerStayingIn,
      };
    },
  });
}
