

## Switch to Native iOS Camera using Capacitor Camera Plugin

### Problem
Currently, `PostMediaPicker.tsx` and `StoryCaptureScreen.tsx` use `react-webcam` which renders an in-app web view camera. This provides a subpar experience on iOS compared to the native camera with its full-featured UI, native gestures, and better image quality.

### Solution
Replace the web camera implementation with Capacitor's `@capacitor/camera` plugin which opens the native iOS camera app for photo capture.

---

### Changes Required

#### 1. Install Capacitor Camera Plugin
Add the `@capacitor/camera` package to the project dependencies.

```bash
npm install @capacitor/camera
npx cap sync
```

#### 2. Create Camera Service Utility
Create a new utility file `src/lib/camera-service.ts` to centralize native camera logic:

```typescript
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedMedia {
  file: File;
  preview: string;
}

export async function capturePhoto(): Promise<CapturedMedia | null> {
  // Use native camera on iOS/Android, fallback to web on browser
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
}

export async function pickFromGallery(): Promise<CapturedMedia | null> {
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
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
```

#### 3. Update PostMediaPicker.tsx
Remove the `react-webcam` implementation and replace with native camera calls:

**Key changes:**
- Remove `Webcam` import and related state (`cameraActive`, `facingMode`, `webcamRef`)
- Add import for `camera-service.ts`
- Simplify UI to just show "Take Photo" and "Choose from Gallery" buttons
- On "Take Photo" click → call `capturePhoto()` from camera service
- On "Choose from Gallery" click → call `pickFromGallery()` from camera service
- Fallback to file input for web browsers

#### 4. Update StoryCaptureScreen.tsx
Similar changes - replace webcam with native camera:

**Key changes:**
- Remove `Webcam` component and related state
- Import and use `capturePhoto()` and `pickFromGallery()` 
- Simplify the UI since native camera handles preview/controls
- Keep gallery fallback for web browsers

---

### Updated Component Flow

**Before (Web Camera):**
```
User taps "Camera" → Web view camera stream renders → User taps capture → Screenshot taken
```

**After (Native Camera):**
```
User taps "Camera" → Native iOS Camera opens → User captures → Returns to app with photo
```

---

### iOS Configuration Required
After syncing, the user must ensure `Info.plist` has the camera permission description:

```xml
<key>NSCameraUsageDescription</key>
<string>Spotted needs camera access to take photos for posts and stories</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Spotted needs photo library access to select photos for posts and stories</string>
```

---

### File Changes Summary

| File | Action |
|------|--------|
| `package.json` | Add `@capacitor/camera` dependency |
| `src/lib/camera-service.ts` | **New file** - camera utility functions |
| `src/components/PostMediaPicker.tsx` | Refactor to use native camera |
| `src/components/StoryCaptureScreen.tsx` | Refactor to use native camera |

---

### Web Fallback
The implementation will detect if running on web vs native:
- **Native (iOS/Android):** Uses Capacitor Camera plugin → opens native camera
- **Web:** Falls back to existing file input with `capture="environment"` attribute for camera access

---

### Technical Notes

- The `react-webcam` dependency can be removed after this change
- Capacitor Camera handles camera permissions automatically
- Native camera provides better image quality and user experience
- Front/back camera selection is handled by the native camera UI

