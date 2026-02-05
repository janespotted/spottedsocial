import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedMedia {
  file: File;
  preview: string;
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
    
    // Mirror the image to match what user saw in viewfinder
    const mirroredBase64 = await mirrorImage(originalBase64, photo.format);
    
    const blob = await (await fetch(mirroredBase64)).blob();
    const file = new File([blob], `capture-${Date.now()}.${photo.format}`, {
      type: `image/${photo.format}`,
    });

    return { file, preview: mirroredBase64 };
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
