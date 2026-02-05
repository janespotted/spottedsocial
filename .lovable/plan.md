
Goal
- Fix selfie capture so the photo shown on the caption preview stays mirrored (matches the viewfinder), instead of “flipping” to un-mirrored after the shutter.

What’s happening (rephrased)
- You’re using the front (selfie) camera in the native camera UI.
- The preview you see while taking the photo is mirrored.
- After capture, the image shown in the caption preview becomes un-mirrored.
- This strongly suggests our current code is doing an extra horizontal flip on iOS (double-mirroring), turning an already-mirrored iOS selfie back into “real orientation”.

Key files involved
- src/lib/camera-service.ts
  - capturePhoto() currently always mirrors every native camera capture via mirrorImage(...)
- src/components/PostMediaPicker.tsx + src/components/StoryCaptureScreen.tsx
  - both call capturePhoto(), so the fix must live in camera-service.ts to cover both flows.

Implementation approach (safe + cross-platform)
1) Make mirroring conditional instead of always-on
   - Add platform-aware logic so iOS does NOT get force-mirrored by our canvas step (because iOS appears to already return mirrored selfies in your current setup).
   - Keep mirroring enabled for platforms where the output is typically un-mirrored (commonly Android), so it still matches the viewfinder expectation.

2) (Optional but recommended) Use EXIF orientation as a secondary signal when available
   - Capacitor returns `photo.exif` sometimes.
   - If `photo.exif?.Orientation` indicates a mirrored orientation (2, 4, 5, 7), we should NOT mirror again.
   - If it’s a normal orientation (1, 3, 6, 8) or missing, fall back to platform default.

3) Add lightweight debug logs temporarily (so we can confirm behavior if anything remains inconsistent)
   - Log: platform, photo.format, presence of exif, exif orientation value, and whether we decided to mirror.
   - These logs will help if the behavior differs across iOS versions/devices.

Concrete code changes (camera-service.ts)
- Update imports:
  - Import CameraDirection from @capacitor/camera only if we choose to use it later; not required for this fix.
- Add helper:
  - function isExifMirrored(exif: any): boolean
- Update capturePhoto():
  - Build originalBase64 as before.
  - Determine `shouldMirror`:
    - const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
    - if (isExifMirrored(photo.exif)) => shouldMirror = false
    - else if (platform === 'ios') => shouldMirror = false
    - else => shouldMirror = true
  - If shouldMirror: run mirrorImage(...)
  - Else: keep originalBase64 as preview, and create File from originalBase64.

Why this should fix your exact case
- Right now iOS is producing a mirrored selfie preview, but our code flips again unconditionally. That second flip is what causes the “after capture it becomes un-mirrored” behavior.
- Skipping the extra mirror step on iOS prevents the post-capture “flip”.

Edge cases / tradeoffs
- If an iOS device/version returns un-mirrored selfies, skipping mirroring would reintroduce the original problem on that device. That’s why the EXIF check is included as a safety net when available.
- If EXIF is missing on iOS and behavior differs by device, we may need to add a user setting (“Mirror selfies”) as a final fallback. I won’t add a setting unless the platform+EXIF logic proves insufficient.

Testing checklist (end-to-end)
- iOS native build:
  1) Open Create Post → Take a Photo with front camera → confirm caption preview matches the viewfinder (mirrored).
  2) Switch to back camera → confirm it doesn’t unexpectedly mirror.
- Android native build (if applicable):
  1) Take selfie → confirm caption preview matches viewfinder (mirrored).
- Story flow:
  1) New Story → Take a Photo (front) → confirm it stays mirrored in the next step(s) that display it.

If still not fixed after this change
- We’ll use the new debug logs to see:
  - whether iOS is providing mirrored pixels already
  - whether EXIF orientation is present
  - whether our shouldMirror decision is wrong
- Then we can adjust per-platform behavior or introduce a simple “Mirror selfie” toggle.

Files to modify
- src/lib/camera-service.ts (only)
