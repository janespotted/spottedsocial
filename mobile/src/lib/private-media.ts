import { supabase } from './supabase';
import { getSessionRevision, onSessionIdentityChange } from './session-identity';

/**
 * Private media links. The post-images bucket and Mux playback are both
 * signed-only; the `private-media` Edge Function checks access in the
 * database (private_media_targets) and returns short-lived links for the
 * items this user may see. Bytes then load straight from the Storage / Mux
 * CDNs and expo-image caches them on disk by storage path — so a feed page
 * costs one link request, and a refresh within the link lifetime costs none.
 *
 * Links are reused until 5 minutes before they expire (server TTL is 30
 * minutes, or the post's own expiry if sooner). Instant revocation is not
 * the link's job: RLS stops the row coming back and the relationship_events
 * realtime signal drops the content from screen (hooks/use-relationship-events).
 */
const REUSE_MARGIN_S = 5 * 60;
const MAX_ITEMS = 60;

interface PathLink { url: string; expires_at: number }
export interface PlaybackLink { stream: string; poster: string; expires_at: number }
interface LinkResponse {
  paths: Record<string, PathLink>;
  playback: Record<string, PlaybackLink>;
}

const pathLinks = new Map<string, PathLink>();
const playbackLinks = new Map<string, PlaybackLink>();
const playbackKey = (id: string, posterWidth: number) => `${id}@${posterWidth}`;
const fresh = (link?: { expires_at: number }) => !!link && link.expires_at - Date.now() / 1000 > REUSE_MARGIN_S;

/** Drop every cached link (account change, relationship change). */
export function forgetPrivateMediaLinks(): void {
  pathLinks.clear();
  playbackLinks.clear();
}
onSessionIdentityChange(forgetPrivateMediaLinks);

export async function resolvePrivateMedia({
  paths = [],
  playbackIds = [],
  posterWidth = 1080,
}: {
  paths?: readonly string[];
  playbackIds?: readonly string[];
  posterWidth?: number;
}): Promise<{ paths: Map<string, string>; playback: Map<string, PlaybackLink> }> {
  const revision = getSessionRevision();
  const wantPaths = [...new Set(paths)];
  const wantIds = [...new Set(playbackIds)];
  const items = [
    ...wantPaths.filter((p) => !fresh(pathLinks.get(p))).map((p) => ({ path: p })),
    ...wantIds.filter((id) => !fresh(playbackLinks.get(playbackKey(id, posterWidth)))).map((id) => ({ id })),
  ];

  for (let i = 0; i < items.length; i += MAX_ITEMS) {
    const chunk = items.slice(i, i + MAX_ITEMS);
    const askPaths = chunk.flatMap((x) => ('path' in x ? [x.path] : []));
    const askIds = chunk.flatMap((x) => ('id' in x ? [x.id] : []));
    const { data, error } = await supabase.functions.invoke<LinkResponse>('private-media', {
      body: { paths: askPaths, playback_ids: askIds, poster_width: posterWidth },
    });
    if (error) throw error;
    if (revision !== getSessionRevision()) throw new Error('Account changed');
    // Anything not returned is not (or no longer) visible: forget it.
    for (const p of askPaths) {
      const link = data?.paths[p];
      if (link) pathLinks.set(p, link);
      else pathLinks.delete(p);
    }
    for (const id of askIds) {
      const link = data?.playback[id];
      if (link) playbackLinks.set(playbackKey(id, posterWidth), link);
      else playbackLinks.delete(playbackKey(id, posterWidth));
    }
  }

  const outPaths = new Map<string, string>();
  for (const p of wantPaths) {
    const link = pathLinks.get(p);
    if (link) outPaths.set(p, link.url);
  }
  const outPlayback = new Map<string, PlaybackLink>();
  for (const id of wantIds) {
    const link = playbackLinks.get(playbackKey(id, posterWidth));
    if (link) outPlayback.set(id, link);
  }
  return { paths: outPaths, playback: outPlayback };
}

/** Storage path inside a signed post-images URL (the stable image cache key). */
export function signedStoragePath(uri: string): string | null {
  const match = uri.match(/^https?:\/\/[^/]+\/storage\/v1\/object\/sign\/post-images\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
