

## Wire Up Native Camera/Gallery for Newsfeed Posts on iOS

### Problem
`PostMediaPicker` calls `captureSelfie()` on native iOS, which forces the **front camera** and **mirrors** the image. For newsfeed posts, users typically want the rear camera without mirroring. The gallery path also redundantly re-creates the file from the preview when `pickFromGallery` already returns a `File`.

### Changes

**`src/components/PostMediaPicker.tsx`**

1. Import `capturePhoto` instead of `captureSelfie` from `camera-service`
2. `handleNativeCapture` — call `capturePhoto()` (rear camera, no mirror) instead of `captureSelfie()`. Use the returned `result.file` directly instead of re-fetching the preview blob.
3. `handleNativeGallery` — use `result.file` directly from `pickFromGallery()` instead of re-fetching.
4. Add error toast if native capture/gallery returns null (user cancelled or permission denied).

This is a 2-line import change + updating the two native handler functions (~10 lines total).

