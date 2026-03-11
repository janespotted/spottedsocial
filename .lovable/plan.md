

## Fix Feed Camera Button on iOS

**Problem**: The feed's `PostMediaPicker` uses Capacitor's `Camera.getPhoto()` API on native platforms, which is failing on iOS. Meanwhile, Yap's image upload works because it uses a simple `<input type="file">` element that iOS handles natively.

**Solution**: Replace the Capacitor camera API calls in `PostMediaPicker` with the same `<input type="file">` pattern used by Yap's `VenueYapThread`.

### Changes — `src/components/PostMediaPicker.tsx`

Remove the imports and calls to `capturePhoto`, `pickFromGallery`, and `isNativePlatform` from `camera-service.ts`. Replace with:

- A hidden `<input type="file" accept="image/*,video/*" capture="environment">` for the camera option (triggers native camera on iOS)
- A hidden `<input type="file" accept="image/*,video/*">` for the gallery option (opens photo picker on iOS)
- Both wired to the same file validation and preview logic already in `handleFileSelect`
- The "Take a Photo" and "Choose from Gallery" buttons simply trigger `.click()` on the respective inputs — keeping the gesture synchronous (critical for iOS Safari security)

This matches the Yap implementation exactly: direct `<input type="file">` click from user gesture, no async Capacitor plugin calls in between.

