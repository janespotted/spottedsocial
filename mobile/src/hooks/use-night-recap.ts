import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { useSession } from './use-session';
import { fetchNightRecap, NIGHT_RECAP_KEY, resolveRecapPhotoUrls, type NightRecap } from '@/lib/night-recap';

/** The caller's Morning After recap (null when the night had no activity). */
export function useNightRecap() {
  const { session } = useSession();
  return useQuery({
    queryKey: [NIGHT_RECAP_KEY, session?.user.id],
    enabled: !!session,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: fetchNightRecap,
  });
}

/** Signed photo links for a recap, keyed by storage key. */
export function useRecapPhotoUrls(recap: NightRecap | null | undefined) {
  const { session } = useSession();
  const keys = recap?.photos.map((p) => p.storage_key) ?? [];
  return useQuery({
    queryKey: [NIGHT_RECAP_KEY, 'photos', session?.user.id, keys],
    enabled: !!session && keys.length > 0,
    staleTime: 20 * 60_000,
    queryFn: () => resolveRecapPhotoUrls(recap!.photos),
  });
}
