import { useEffect, useState } from 'react';
import { usePrivateQuery } from './use-private-query';
import { useSession } from './use-session';
import { useNightMode } from './use-night-mode';
import { supabase } from '@/lib/supabase';
import { collectVenueVisits } from '@/lib/venue-visits';

/** One shared city query across every card; the server checks the recorded audience, current privacy and 90-day expiry. */
export function useVenueVisits(venueId: string) {
  const { session } = useSession();
  const { city } = useNightMode();
  const [now, setNow] = useState(Date.now);
  const query = usePrivateQuery({
    queryKey: ['venue-visits', session?.user.id, city],
    enabled: !!session,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const fetchedAt = Date.now();
      const { data, error } = await (supabase as any).rpc('get_recent_venue_visits', { p_city: city });
      if (error) throw error;
      return collectVenueVisits(data ?? [], session!.user.id, fetchedAt);
    },
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
      const clock = Date.now();
      setNow(clock);
      const next = Math.min(...(query.data ?? []).map(v => v.expires_at).filter(t => t > clock));
      if (Number.isFinite(next)) timer = setTimeout(expire, Math.min(next - clock + 50, 2_147_483_647));
    };
    expire();
    return () => clearTimeout(timer);
  }, [query.data]);
  // Failed authorization refreshes never leave a stale visit badge visible.
  return query.isError ? [] : (query.data ?? []).filter(v => v.venue_id === venueId && v.expires_at > now);
}
