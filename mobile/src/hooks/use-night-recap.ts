import { useMemo } from 'react';
import { usePrivateQuery as useQuery } from '@/hooks/use-private-query';
import { useSession } from './use-session';
import {
  fetchNightRecap,
  MAX_RECAP_PHOTOS,
  NIGHT_RECAP_KEY,
  recapMediaKey,
  resolveRecapPhotoUrls,
  type NightRecap,
} from '@/lib/night-recap';
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

/** Signed links for a recap's saved pictures (image, and a video's stream), keyed by recapMediaKey. */
export function useRecapPhotoUrls(recap: NightRecap | null | undefined) {
  const { session } = useSession();
  const keys = recap?.photos.map(recapMediaKey) ?? [];
  return useQuery({
    queryKey: [NIGHT_RECAP_KEY, 'photos', session?.user.id, keys],
    enabled: !!session && keys.length > 0,
    staleTime: 20 * 60_000,
    queryFn: () => resolveRecapPhotoUrls(recap!.photos),
  });
}

/** One picture in the recap, whatever it came from. */
export interface RecapPicture {
  /** The saved row's id, or `device-…` (from the asset id) for a camera-roll photo. */
  id: string;
  url: string | undefined;
  thumbhash: string | null;
  /** A video post: the scrapbook shows its poster, the viewer plays this. */
  video: boolean;
  stream: string | undefined;
  /** From the camera roll: shown from the device, never uploaded. */
  onDevice: boolean;
}

/** Only newsfeed posts belong in the private recap; never query the device library. */
export function useRecapPictures(recap: NightRecap | null | undefined) {
  const urls = useRecapPhotoUrls(recap);
  const pictures = useMemo<RecapPicture[]>(() => (recap?.photos ?? [])
    .filter(p => p.source === 'post').slice(0, MAX_RECAP_PHOTOS).map(p => {
      const link = urls.data?.get(recapMediaKey(p));
      return { id: p.id, url: link?.url, thumbhash: p.thumbhash,
        video: p.kind === 'video', stream: link?.stream, onDevice: false };
    }), [recap, urls.data]);
  return { pictures };
}
