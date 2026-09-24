import { privateMediaUrl } from './private-media';

export type MuxStatus = 'preparing' | 'ready' | 'errored';

/** HLS manifest; AVPlayer (expo-video) and ExoPlayer play it natively. */
export function muxHlsUrl(playbackId: string): string {
  return privateMediaUrl({ playback_id: playbackId, kind: 'video' });
}

/**
 * Poster frame, cropped to the feed's 4:5 so it lines up with the player
 * that replaces it. Stable per playback id, so it caches like any image.
 */
export function muxThumbnailUrl(
  playbackId: string,
  { width = 1080, height = Math.round(width * 1.25), time = 0.5 } = {}
): string {
  return privateMediaUrl({ playback_id: playbackId, kind: 'thumbnail', width: String(width), height: String(height), time: String(time) });
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
