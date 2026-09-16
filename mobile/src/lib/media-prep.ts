import { loadImage, thumbHashToBase64String } from 'react-native-nitro-image';
import type { CapturedMedia } from './post-media';

/**
 * Longest edge of an uploaded photo. The feed draws posts at 4:5 of the
 * screen width — 1170×1464 px on a 3× iPhone — so anything past ~1920
 * is bytes the viewer never sees (a 12 MP capture is 3–5 MB; this lands
 * at 300–600 KB).
 */
export const MAX_IMAGE_EDGE = 1920;
const JPEG_QUALITY = 82;
/** ThumbHash input; the encoder wants ≤100 px on each side. */
const HASH_EDGE = 96;

export interface PreparedMedia extends CapturedMedia {
  width: number | null;
  height: number | null;
  /** ThumbHash, base64 — expo-image renders it as the placeholder. */
  thumbhash: string | null;
}

function fit(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Downscale + re-encode a photo for upload and compute its ThumbHash and
 * pixel size. Runs on the native image pipeline (react-native-nitro-image,
 * already linked as a VisionCamera peer) so a 12 MP file never crosses the
 * bridge as pixels. Videos pass through untouched: the recorder is already
 * capped at 1080p / 6 Mbps in the camera, and there is no hash for them yet.
 *
 * Never throws for a photo it cannot decode — the original is uploaded
 * as-is, without a hash, rather than blocking the post.
 */
export async function prepareForUpload(media: CapturedMedia): Promise<PreparedMedia> {
  if (media.type !== 'image') return { ...media, width: null, height: null, thumbhash: null };
  try {
    const source = await loadImage({ filePath: media.uri });
    const target = fit(source.width, source.height, MAX_IMAGE_EDGE);
    const needsResize = target.width < source.width || target.height < source.height;
    const sized = needsResize ? await source.resizeAsync(target.width, target.height) : source;

    const tiny = fit(sized.width, sized.height, HASH_EDGE);
    const small = await sized.resizeAsync(tiny.width, tiny.height);
    const thumbhash = thumbHashToBase64String(await small.toThumbHashAsync());

    // Always re-encode: HEIC/PNG library picks become JPEG, and the camera's
    // JPEG gets the feed quality setting.
    const path = await sized.saveToTemporaryFileAsync('jpg', JPEG_QUALITY);
    return {
      uri: `file://${path}`,
      type: 'image',
      mimeType: 'image/jpeg',
      fileExt: 'jpg',
      width: sized.width,
      height: sized.height,
      thumbhash,
    };
  } catch (e) {
    console.warn('[media-prep] falling back to the original file', e);
    return { ...media, width: null, height: null, thumbhash: null };
  }
}
