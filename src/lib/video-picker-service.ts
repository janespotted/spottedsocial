import { isNativePlatform } from '@/lib/platform';

const MAX_VIDEO_SIZE_MB = 50;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 30;

export interface VideoPickResult {
  file: File;
  previewUrl: string;
  duration: number | null;
}

/**
 * Pick a video using Capawesome FilePicker on native, or <input> fallback on web.
 * Returns a File, an object URL for preview, and duration (if obtainable).
 */
export async function pickVideoNative(): Promise<VideoPickResult> {
  if (!isNativePlatform()) {
    throw new Error('Native video picker is only available on iOS/Android');
  }

  const { FilePicker } = await import('@capawesome/capacitor-file-picker');

  const result = await FilePicker.pickVideos({
    readData: true,
  });

  const picked = result.files[0];
  if (!picked) throw new Error('No video selected');

  // Convert base64 data to a File
  if (!picked.data) throw new Error('Failed to read video data');

  const mimeType = picked.mimeType || 'video/mp4';
  const byteString = atob(picked.data);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeType });

  const ext = mimeType.split('/')[1] || 'mp4';
  const fileName = picked.name || `video_${Date.now()}.${ext}`;
  const file = new File([blob], fileName, { type: mimeType });

  // Size check
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    throw new Error(`Video is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is ${MAX_VIDEO_SIZE_MB}MB.`);
  }

  const previewUrl = URL.createObjectURL(file);

  // Duration check — picked.duration is in seconds on native
  const duration = picked.duration != null ? picked.duration : null;
  if (duration != null && duration > MAX_VIDEO_DURATION_SECONDS) {
    URL.revokeObjectURL(previewUrl);
    throw new Error(`Video is too long (${Math.round(duration)}s). Maximum is ${MAX_VIDEO_DURATION_SECONDS} seconds.`);
  }

  return { file, previewUrl, duration };
}

/**
 * Validate a video File selected via web <input>.
 * Checks size immediately and loads it into a <video> element to check duration.
 */
export function validateWebVideo(file: File): Promise<VideoPickResult> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      reject(new Error(`Video is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is ${MAX_VIDEO_SIZE_MB}MB.`));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (duration > MAX_VIDEO_DURATION_SECONDS) {
        URL.revokeObjectURL(previewUrl);
        reject(new Error(`Video is too long (${Math.round(duration)}s). Maximum is ${MAX_VIDEO_DURATION_SECONDS} seconds.`));
        return;
      }
      resolve({ file, previewUrl, duration });
    };

    video.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new Error('Could not read video file. Please try a different format.'));
    };

    video.src = previewUrl;
  });
}
