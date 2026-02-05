import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedMedia {
  file: File;
  preview: string;
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

    const base64 = `data:image/${photo.format};base64,${photo.base64String}`;
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
