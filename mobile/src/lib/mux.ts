/**
 * Mux playback URLs. Playback ids are public (unguessable) — the post row
 * itself is what RLS protects, and every asset is deleted at the 5 AM
 * cleanup, so a leaked id dies with the night.
 */
export type MuxStatus = 'preparing' | 'ready' | 'errored';

/** HLS manifest; AVPlayer (expo-video) and ExoPlayer play it natively. */
export function muxHlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8?max_resolution=1080p`;
}

/**
 * Poster frame, cropped to the feed's 4:5 so it lines up with the player
 * that replaces it. Stable per playback id, so it caches like any image.
 */
export function muxThumbnailUrl(
  playbackId: string,
  { width = 1080, height = Math.round(width * 1.25), time = 0.5 } = {}
): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${time}&width=${width}&height=${height}&fit_mode=smartcrop`;
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
