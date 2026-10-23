import { useQuery } from '@tanstack/react-query';
import { useSession } from './use-session';
import { useNightMode } from './use-night-mode';
import { fetchFeaturedVenues, fetchSavedVenueNames } from '@/lib/venue-discovery';
import { rankRecommendations } from '@/lib/venue-recommendations';

export function useVenueRecommendations(enabled = true, search = '') {
  const { session } = useSession();
  const { city } = useNightMode();
  const saved = useQuery({ queryKey: ['saved-venues', session?.user.id], enabled: enabled && !!session,
    queryFn: () => fetchSavedVenueNames(session!.user.id) });
  const featured = useQuery({ queryKey: ['venue-picks', city], enabled: enabled && !!session,
    queryFn: () => fetchFeaturedVenues(city), staleTime: 5 * 60_000 });
  return { ...featured, city, rows: rankRecommendations(featured.data ?? [], city, saved.data ?? [], search),
    refresh: async () => { await Promise.all([featured.refetch(), saved.refetch()]); } };
}
