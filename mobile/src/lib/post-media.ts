import * as ImagePicker from 'expo-image-picker';

/** Hold-to-record cap; shown on the camera so the limit is never a surprise. */
export const MAX_VIDEO_SECONDS = 14;

export interface CapturedMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  fileExt: string;
}

/** Native file paths from the camera come without a scheme; fetch() needs one. */
export function toFileUri(path: string): string {
  return path.startsWith('file://') || path.startsWith('ph://') ? path : `file://${path}`;
}

/** System photo picker (PHPicker on iOS — no photo permission needed). */
export async function pickFromLibrary(): Promise<CapturedMedia | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.8,
    videoMaxDuration: MAX_VIDEO_SECONDS,
    allowsEditing: false,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  const isVideo = asset.type === 'video';
  const mimeType = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  return {
    uri: asset.uri,
    type: isVideo ? 'video' : 'image',
    mimeType,
    fileExt: isVideo
      ? mimeType.includes('quicktime')
        ? 'mov'
        : 'mp4'
      : mimeType === 'image/png'
        ? 'png'
        : 'jpg',
  };
}
