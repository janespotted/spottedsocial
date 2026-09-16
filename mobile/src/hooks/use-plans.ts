import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createResilientChannel } from '@/lib/resilient-channel';
import { fetchEventsWithFriends, fetchMyVotes, fetchPlans } from '@/lib/plans';
import type { NightStatusKind } from '@/lib/night-status';
import { OWN_NIGHT_STATUS_KEY, useOwnNightStatus } from './use-own-night-status';
import { useFriendIds } from './use-friend-ids';
import { useSession } from './use-session';

export interface MyNightStatus {
  status: NightStatusKind | null;
  planning_neighborhood: string | null;
  planning_visibility: string | null;
}

/**
 * The caller's own unexpired night status — drives the Out/TBD/Staying In
 * control. A projection of the one shared status query (useOwnNightStatus).
 */
export function useMyNightStatus() {
  const query = useOwnNightStatus();
  const s = query.data?.status ?? null;
  const data: MyNightStatus | undefined = query.data
    ? {
        status: s?.status ?? null,
        planning_neighborhood: s?.planning_neighborhood ?? null,
        planning_visibility: s?.planning_visibility ?? null,
      }
    : undefined;
  return { ...query, data };
}

/** Unexpired plans (score-sorted) plus the caller's votes. */
export function usePlans() {
  const { session } = useSession();
  return useQuery({
    queryKey: ['plans', session?.user.id],
    enabled: !!session,
    staleTime: 30_000,
    queryFn: async () => {
      const [plans, votes] = await Promise.all([fetchPlans(), fetchMyVotes(session!.user.id)]);
      return { plans, votes };
    },
  });
}

/** Upcoming events in the user's city that friends have RSVP'd to. */
export function usePlanEvents(city: string | null | undefined) {
  const { session } = useSession();
  const { data: friendIds } = useFriendIds(session?.user.id);
  return useQuery({
    queryKey: ['plan-events', session?.user.id, city, friendIds],
    enabled: !!session && !!city && !!friendIds,
    staleTime: 60_000,
    queryFn: () => fetchEventsWithFriends(city!, session!.user.id, friendIds!),
  });
}

/**
 * Realtime refresh for the Plans tab: plans + plan_downs changes re-fetch the
 * plan feed (1.5s debounce, matching web), night_statuses changes re-fetch the
 * own-status row (friends-out has its own subscription in useFriendsOut).
 */
export function usePlansRealtime() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) return;
    let plansTimer: ReturnType<typeof setTimeout>;
    let statusTimer: ReturnType<typeof setTimeout>;

    const invalidatePlans = () => {
      clearTimeout(plansTimer);
      plansTimer = setTimeout(
        () => queryClient.invalidateQueries({ queryKey: ['plans'] }),
        1500
      );
    };
    const invalidateStatus = () => {
      clearTimeout(statusTimer);
      statusTimer = setTimeout(
        () => queryClient.invalidateQueries({ queryKey: [OWN_NIGHT_STATUS_KEY] }),
        500
      );
    };

    const teardown = createResilientChannel({
      name: 'plans-realtime',
      onReconnect: () => {
        invalidatePlans();
        invalidateStatus();
      },
      configure: (ch) =>
        ch
          .on('postgres_changes', { event: '*', schema: 'public', table: 'plans' }, invalidatePlans)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'plan_downs' },
            invalidatePlans
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'night_statuses' },
            invalidateStatus
          ),
    });

    return () => {
      clearTimeout(plansTimer);
      clearTimeout(statusTimer);
      teardown();
    };
  }, [session, queryClient]);
}
