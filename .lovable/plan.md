

## TestFlight Readiness Audit

### What's Already Done (Good Shape)

| Area | Status |
|------|--------|
| Capacitor installed + configured | `com.spotted.app`, webDir `dist`, iOS contentInset `automatic` |
| Native push (APNs) | Full subscribe/unsubscribe flow via `@capacitor/push-notifications`, token stored in profiles |
| Camera | Front/back capture + gallery via `@capacitor/camera` with mirror logic |
| Platform detection | `isNativePlatform()` helper used throughout; native-aware navigation (no full page reloads) |
| OAuth redirect handling | `getRedirectOrigin()` returns `APP_BASE_URL` on native so OAuth callbacks work |
| Haptics | `@capacitor/haptics` integrated |
| Clipboard | Native clipboard via `@capacitor/clipboard` |
| Share | `@capacitor/share` installed |
| Deep link notification routing | `pushNotificationActionPerformed` listener navigates to `data.url` |
| Splash screen | Custom React splash while auth loads |
| Service worker skip on native | `main.tsx` correctly skips SW registration on Capacitor |
| Viewport meta | `viewport-fit=cover` set for safe areas |
| Safe area padding | Layout uses `env(safe-area-inset-*)` |

### Issues to Fix for TestFlight

#### 1. Missing `VITE_VAPID_PUBLIC_KEY` in `.env` (Critical)
The `.env` file does not contain `VITE_VAPID_PUBLIC_KEY`. It exists as a backend secret but Vite needs it as a `VITE_` env var at build time. Without it, web push subscription silently fails (`VAPID_PUBLIC_KEY` is `undefined`). This affects both web and the initial check flow on native.

**Fix:** Add `VITE_VAPID_PUBLIC_KEY` to the `.env` file with the public VAPID key value. (Note: this is a public key, safe to embed.)

#### 2. No `apple-app-site-association` file (Important for Universal Links)
There's no `public/.well-known/apple-app-site-association` file. Without it, invite deep links (`/invite/:code`) won't open the native app directly. For TestFlight this is non-blocking but needed before App Store release.

**Fix:** Create `public/.well-known/apple-app-site-association` with the app's bundle ID and allowed paths.

#### 3. Missing iOS `Info.plist` permission strings (Critical for App Review)
No `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, or `NSPhotoLibraryUsageDescription` strings found. These are mandatory -- Apple will reject the binary without them.

**Fix:** These must be added in Xcode's `Info.plist` after `npx cap add ios`. Document the required strings:
- `NSLocationWhenInUseUsageDescription` -- "Spotted uses your location to find nearby venues and show friends where you're hanging out."
- `NSCameraUsageDescription` -- "Spotted needs camera access to take photos for posts and your profile."
- `NSPhotoLibraryUsageDescription` -- "Spotted needs photo library access to share photos in posts."

This is an Xcode-side change (not in the Lovable codebase), so we should document it clearly.

#### 4. `capacitor.config.ts` missing `server` block for dev hot-reload
The config has no `server.url` for development. When running on-device via TestFlight-like builds this is fine (it loads from `dist`), but for development testing it means you can't hot-reload. Non-blocking for TestFlight.

#### 5. App icon not configured for iOS
Only `icon-192.png` and `icon-512.png` exist (PWA icons). iOS requires a 1024x1024 `AppIcon` asset in the Xcode asset catalog. This is an Xcode-side task.

#### 6. Version string hardcoded as `v1.0.0`
In `Settings.tsx` the version is hardcoded. Fine for now but should eventually be dynamic.

### Changes I'll Make

| # | File | Change |
|---|------|--------|
| 1 | `public/.well-known/apple-app-site-association` | Create the Universal Links association file for `com.spotted.app` |
| 2 | `capacitor.config.ts` | Add `plugins` config for `PushNotifications` (to present in foreground on iOS) |

### What You Need to Do in Xcode (After Implementation)

1. **Add Info.plist permission strings** (Location, Camera, Photo Library)
2. **Set up a 1024x1024 AppIcon** in the Xcode asset catalog
3. **Enable Push Notifications capability** in Signing & Capabilities
4. **Enable Associated Domains capability** and add `applinks:spottedsocial.lovable.app`
5. **Configure APNs** in Apple Developer portal and upload the key to your push service
6. Run `npx cap sync ios` after pulling code changes

