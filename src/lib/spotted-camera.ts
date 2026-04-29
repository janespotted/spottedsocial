import { registerPlugin, Capacitor } from '@capacitor/core';
import { isNativePlatform } from './platform';

interface SpottedCameraPlugin {
  openCamera(): Promise<{ type: 'photo' | 'video'; path: string }>;
}

const SpottedCamera = registerPlugin<SpottedCameraPlugin>('SpottedCamera');

export interface CaptureResult {
  type: 'photo' | 'video';
  file: File;
  previewUrl: string;
}

/**
 * Open the Spotted custom camera.
 * Tap = photo, hold = video (14s max).
 * Returns a File + preview URL ready for the caption screen.
 */
export async function openSpottedCamera(): Promise<CaptureResult> {
  if (!isNativePlatform()) {
    throw new Error('Camera is only available on native platforms');
  }

  const result = await SpottedCamera.openCamera();

  // Convert native file path to a web-accessible URL
  const webPath = Capacitor.convertFileSrc(result.path);

  // Fetch the file as a blob
  const response = await fetch(webPath);
  const blob = await response.blob();

  const extension = result.type === 'video' ? 'mp4' : 'jpg';
  const mimeType = result.type === 'video' ? 'video/mp4' : 'image/jpeg';
  const filename = `spotted_${result.type}_${Date.now()}.${extension}`;

  const file = new File([blob], filename, { type: mimeType });
  const previewUrl = URL.createObjectURL(blob);

  return {
    type: result.type,
    file,
    previewUrl,
  };
}
