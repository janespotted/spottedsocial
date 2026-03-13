import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedMedia {
  file: File;
  preview: string;
}

// Mirror image horizontally (for front camera selfies)
async function mirrorImage(base64: string, format: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Apply horizontal flip
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      
      // Preserve original format
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(mimeType, 0.92));
    };
    img.onerror = () => reject(new Error('Failed to load image for mirroring'));
    img.src = base64;
  });
}

/**
 * Capture a selfie using the front camera.
 * Always mirrors the result to match what the user saw in the viewfinder.
 */
export async function captureSelfie(): Promise<CapturedMedia | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      direction: CameraDirection.Front,
      correctOrientation: true,
    });

    if (!photo.base64String) return null;

    const originalBase64 = `data:image/${photo.format};base64,${photo.base64String}`;
    
    // Always mirror front camera captures to match the viewfinder preview
    const mirroredBase64 = await mirrorImage(originalBase64, photo.format);
    
    console.log('[camera-service] captureSelfie: mirrored front camera image');
    
    const blob = await (await fetch(mirroredBase64)).blob();
    const file = new File([blob], `selfie-${Date.now()}.${photo.format}`, {
      type: `image/${photo.format}`,
    });

    return { file, preview: mirroredBase64 };
  } catch (error) {
    console.error('Error capturing selfie:', error);
    return null;
  }
}

/**
 * Capture a photo using the back camera.
 * Does not mirror the result.
 */
export async function capturePhoto(): Promise<CapturedMedia | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      direction: CameraDirection.Rear,
      correctOrientation: true,
    });

    if (!photo.base64String) return null;

    const base64 = `data:image/${photo.format};base64,${photo.base64String}`;
    
    console.log('[camera-service] capturePhoto: back camera image (no mirror)');
    
    const blob = await (await fetch(base64)).blob();
    const file = new File([blob], `capture-${Date.now()}.${photo.format}`, {
      type: `image/${photo.format}`,
    });

    return { file, preview: base64 };
  } catch (error) {
    console.error('Error capturing photo:', error);
    return null;
  }
}

/**
 * Prompt user to choose camera (front or back) and capture.
 * Front camera results are always mirrored.
 */
export async function captureWithPrompt(): Promise<CapturedMedia | null> {
  try {
    // Use Camera source which prompts user to choose camera
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
    
    // On iOS, we can't reliably detect which camera was used, so we use a heuristic:
    // - EXIF data or metadata might indicate front camera
    // - For now, we'll mirror by default since stories/posts are typically selfies
    // On web, the system camera picker is used so we mirror for safety
    
    // Simple heuristic: always mirror to be safe for social media apps
    // Users taking photos of things (not selfies) typically use gallery
    const shouldMirror = true;
    
    console.log('[camera-service] captureWithPrompt:', { platform, shouldMirror });
    
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

export async function captureVideo(): Promise<CapturedMedia | null> {
  try {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';
      input.capture = 'environment';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(null); return; }
        const preview = URL.createObjectURL(file);
        resolve({ file, preview });
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  } catch (error) {
    console.error('Error capturing video:', error);
    return null;
  }
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
