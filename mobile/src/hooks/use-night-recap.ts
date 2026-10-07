import { useMemo } from 'react';
import { useQuery as usePlainQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  findNightPhotos,
  getCameraRollAccess,
  requestCameraRollAccess,
  type CameraRollAccess,
} from '@/lib/recap-camera-roll';

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

const ACCESS_KEY = ['camera-roll-access'];

/** Photo-library access, read without ever prompting; `request()` asks. */
export function useCameraRollAccess() {
  const queryClient = useQueryClient();
  const query = usePlainQuery({ queryKey: ACCESS_KEY, queryFn: getCameraRollAccess, staleTime: 0 });
  const request = async () => {
    const access = await requestCameraRollAccess();
    queryClient.setQueryData(ACCESS_KEY, access);
    return access;
  };
  return { access: query.data as CameraRollAccess | undefined, request };
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

/**
 * Everything the Pictures chapter, the viewer and Home's card show, in one
 * order: the saved pictures (photo and video posts, library additions), then
 * photos from the camera roll taken during the night's stops — only once the
 * user has granted library access, and only up to the recap's nine.
 */
export function useRecapPictures(recap: NightRecap | null | undefined) {
  const urls = useRecapPhotoUrls(recap);
  const { access, request } = useCameraRollAccess();
  const granted = access === 'all' || access === 'limited';
  const room = MAX_RECAP_PHOTOS - (recap?.photos.length ?? 0);
  const device = usePlainQuery({
    queryKey: [NIGHT_RECAP_KEY, 'camera-roll', recap?.id, access, room],
    enabled: !!recap && granted && room > 0 && recap.stops.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => findNightPhotos(recap!.stops, room),
  });

  const pictures = useMemo<RecapPicture[]>(() => {
    const saved = (recap?.photos ?? []).map((p) => {
      const link = urls.data?.get(recapMediaKey(p));
      return {
        id: p.id,
        url: link?.url,
        thumbhash: p.thumbhash,
        video: p.kind === 'video',
        stream: link?.stream,
        onDevice: false,
      };
    });
    const local = (granted ? (device.data ?? []) : []).map((d) => ({
      // The zoom transition can't match a boundary id with ':' or '/' in it
      // ("ph://…/L0/001" never linked), so the asset id is only the source.
      id: `device-${d.id.replace(/[^A-Za-z0-9-]/g, '_')}`,
      url: d.id,
      thumbhash: null,
      video: false,
      stream: undefined,
      onDevice: true,
    }));
    return [...saved, ...local];
  }, [recap, urls.data, device.data, granted]);

  return { pictures, access, requestAccess: request, canSuggest: !!recap && recap.stops.length > 0 };
}
