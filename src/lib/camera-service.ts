import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedMedia {
  file: File;
  preview: string;
}

// Check if EXIF orientation indicates image is already mirrored
// Mirrored orientations: 2 (flipped horizontal), 4 (flipped vertical + 180), 5, 7
function isExifMirrored(exif: any): boolean {
  if (!exif || typeof exif.Orientation !== 'number') return false;
  return [2, 4, 5, 7].includes(exif.Orientation);
}

// Mirror image horizontally (for front camera selfies)
async function mirrorImage(base64: string, format: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d')!;
      
      // Apply horizontal flip
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      
      // Preserve original format
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(mimeType, 0.9));
    };
    img.src = base64;
  });
}

export async function capturePhoto(): Promise<CapturedMedia | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: true,
    });

    if (!photo.base64String) return null;

    const originalBase64 = `data:image/${photo.format};base64,${photo.base64String}`;
    const platform = Capacitor.getPlatform();
    
    // Determine whether to mirror based on platform and EXIF
    // iOS typically returns already-mirrored selfies, so skip mirroring
    // Android/web typically return un-mirrored, so we mirror to match viewfinder
    let shouldMirror = false;
    
    if (isExifMirrored(photo.exif)) {
      // EXIF says it's already mirrored - don't double-mirror
      shouldMirror = false;
    } else if (platform === 'ios') {
      // iOS returns mirrored selfies by default - don't mirror again
      shouldMirror = false;
    } else {
      // Android/web: mirror to match the viewfinder preview
      shouldMirror = true;
    }
    
    // Debug logging (temporary - helps troubleshoot device variations)
    console.log('[camera-service] capturePhoto:', {
      platform,
      format: photo.format,
      hasExif: !!photo.exif,
      exifOrientation: photo.exif?.Orientation,
      shouldMirror,
    });
    
    let finalBase64 = originalBase64;
    if (shouldMirror) {
      finalBase64 = await mirrorImage(originalBase64, photo.format);
    }
    
    const blob = await (await fetch(finalBase64)).blob();
    const file = new File([blob], `capture-${Date.now()}.${photo.format}`, {
      type: `image/${photo.format}`,
    });

    return { file, preview: finalBase64 };
  } catch (error) {
    console.error('Error capturing photo:', error);
    return null;
  }
}

export async function pickFromGallery(): Promise<CapturedMedia | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
      correctOrientation: true,
    });

    if (!photo.base64String) return null;

    const base64 = `data:image/${photo.format};base64,${photo.base64String}`;
    const blob = await (await fetch(base64)).blob();
    const file = new File([blob], `gallery-${Date.now()}.${photo.format}`, {
      type: `image/${photo.format}`,
    });

    return { file, preview: base64 };
  } catch (error) {
    console.error('Error picking from gallery:', error);
    return null;
  }
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
