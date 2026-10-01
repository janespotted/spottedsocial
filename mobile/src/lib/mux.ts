import { resolvePrivateMedia } from './private-media';

export type MuxStatus = 'preparing' | 'ready' | 'errored';

/**
 * Mux playback is signed-only: the HLS manifest
 * (`stream.mux.com/{id}.m3u8?token=`) and the poster frame
 * (`image.mux.com/{id}/thumbnail.jpg?token=`, cropped 4:5 so it lines up
 * with the player that replaces it) come from lib/private-media. Feed posts
 * carry them as `mux_stream_url` / `mux_poster_url`; other lists use this
 * batch helper for poster frames at their own size.
 */
export async function resolveMuxPosters(
  playbackIds: readonly string[],
  width = 1080
): Promise<Map<string, string>> {
  const { playback } = await resolvePrivateMedia({ playbackIds, posterWidth: width });
  return new Map([...playback].map(([id, link]) => [id, link.poster]));
}

/** What the feed should draw for a video post. */
export function muxPlaybackState(
  status: string | null | undefined,
  playbackId: string | null | undefined
): 'ready' | 'processing' | 'errored' {
  if (playbackId && status !== 'errored') return 'ready';
  if (status === 'errored') return 'errored';
  return 'processing';
}
