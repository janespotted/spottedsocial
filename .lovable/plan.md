

# iOS Capacitor Compatibility Audit

## CRITICAL ISSUES (Will Break)

### 1. OAuth Redirect URI -- BLOCKER
**Files:** `src/pages/Auth.tsx` lines 110, 126
```
redirect_uri: window.location.origin
```
In Capacitor iOS, `window.location.origin` resolves to `capacitor://localhost`. This origin is almost certainly not registered as an allowed redirect URI with Google or Apple OAuth. The OAuth flow will fail with an "invalid redirect" error.

**Fix needed:** Detect Capacitor environment and use a custom URL scheme or Universal Link, or use `@capacitor/browser` to open OAuth in an in-app browser with the hosted app's origin as the redirect, then deep-link back.

---

### 2. Service Worker Registration -- WILL SILENTLY FAIL
**Files:** `src/main.tsx` lines 5-8, `src/hooks/usePushNotifications.ts` lines 41-42, 55, 75-76, 105, 147
WKWebView on iOS does **not** support Service Workers. All of the following will silently fail or error:
- `navigator.serviceWorker.register('/sw.js')` -- main.tsx line 7
- `navigator.serviceWorker.ready` -- usePushNotifications.ts lines 55, 105, 147
- `'serviceWorker' in navigator` -- will be `false` in WKWebView

**Impact:** Web Push subscription/unsubscription is entirely broken. The `usePushNotifications` hook will report `isSupported = false` and never subscribe.

**Fix needed:** Gate service worker registration behind a `!Capacitor.isNativePlatform()` check. Use `@capacitor/push-notifications` plugin for native push on iOS instead.

---

### 3. Web Push Notifications API -- NOT AVAILABLE
**Files:** `src/lib/notifications.ts` lines 6, 11, 16, 23-24, 26-27; `src/hooks/usePushNotifications.ts` lines 42-43
`window.Notification` and `PushManager` do not exist in WKWebView. The browser `Notification` constructor (line 27 of notifications.ts) will throw. The permission checks will all return false.

**Fix needed:** Replace with `@capacitor/push-notifications` for native APNs. You already have the `apns_device_token` column and server-side APNs logic -- just need the client-side Capacitor plugin.

---

## HIGH PRIORITY (Functional Issues)

### 4. `window.location.href` for Navigation
**Files:** `src/contexts/AuthContext.tsx` lines 73, 91; `src/components/PageErrorBoundary.tsx` line 40
Using `window.location.href = '/auth'` or `window.location.href = '/'` triggers a full page reload. In Capacitor, this reloads the entire WebView from the local bundle, which is slow (~1-2s white flash) and destroys all React state.

**Fix needed:** Use React Router's `navigate()` instead of `window.location.href` for in-app navigation.

---

### 5. `window.location.origin` in Invite/Share URLs
**Files:**
- `src/pages/Friends.tsx` line 340 -- `getInviteUrl()`
- `src/pages/Profile.tsx` line 117 -- `getInviteUrl()`
- `src/pages/Settings.tsx` line 62 -- `getInviteUrl()`
- `src/pages/Feed.tsx` line 398 -- share URL
- `src/pages/Home.tsx` line 579 -- share URL
- `src/components/FindFriendsOnboarding.tsx` line 126 -- `getInviteUrl()`
- `src/components/InviteFriendsSection.tsx` line 89 -- `getInviteUrl()`
- `src/components/VenueIdCard.tsx` line 560 -- share URL
- `src/components/EventCard.tsx` line 134 -- share URL
- `src/pages/Profile.tsx` lines 316, 323 -- `window.location.href`

All of these will generate URLs like `capacitor://localhost/invite/ABC123` which are completely useless -- they can't be opened by anyone. They need to use your published URL (`https://spottedsocial.lovable.app`) instead.

**Fix needed:** Create a constant like `const APP_BASE_URL = 'https://spottedsocial.lovable.app'` and use it for all shareable URLs.

---

### 6. `window.open()` Behavior
**Files:**
- `src/pages/Settings.tsx` line 268 -- `mailto:` link
- `src/components/EventCard.tsx` line 144 -- ticket URL
- `src/components/VenueIdCard.tsx` line 522 -- Apple Maps URL
- `src/components/LocationPermissionPrompt.tsx` line 121 -- Chrome help page

`window.open()` in WKWebView either opens in the same WebView (breaking your app) or is blocked entirely. External URLs should use `@capacitor/browser` plugin's `Browser.open()` to open in an in-app Safari sheet.

The `mailto:` link (Settings.tsx line 268) and `sms:` link (`src/pages/Friends.tsx` line 347) should work via `window.location.href` on iOS as URL schemes, but `window.open` with `_blank` may not.

---

### 7. `navigator.vibrate()` -- No-Op on iOS
**File:** `src/lib/haptics.ts` lines 9, 16, 23, 30, 37
`navigator.vibrate()` is **not supported** on iOS (Safari or WKWebView). It's already wrapped in try/catch with optional chaining, so it won't crash, but haptics will be completely absent.

**Fix needed:** Use `@capacitor/haptics` plugin for native haptic feedback on iOS. The try/catch means this is safe to leave for now but the UX will feel flat.

---

### 8. `navigator.clipboard.writeText()` -- Restricted in WKWebView
**Files:**
- `src/pages/Feed.tsx` lines 405, 410
- `src/pages/Home.tsx` lines 586, 591
- `src/pages/Friends.tsx` line 352
- `src/pages/Profile.tsx` line 323
- `src/components/FindFriendsOnboarding.tsx` line 130
- `src/components/InviteFriendsSection.tsx` line 94
- `src/components/VenueIdCard.tsx` line 575
- `src/components/QRCodeModal.tsx` line 17

`navigator.clipboard.writeText()` requires a secure context AND user activation. In WKWebView it may silently fail. Use `@capacitor/clipboard` plugin as a reliable alternative.

---

### 9. Password Reset Redirect URL
**File:** `src/pages/ResetPassword.tsx` line 37
```
redirectTo: `${window.location.origin}/reset-password`
```
Same `capacitor://localhost` problem. The reset email link will point to a non-functional URL.

**Fix needed:** Use `APP_BASE_URL` constant here too.

---

### 10. Email Signup Confirmation Redirect
**File:** `src/pages/Auth.tsx` line 169
```
redirectUrl: `${window.location.origin}/`
```
Email confirmation links will redirect to `capacitor://localhost/` which won't open the native app unless Universal Links are configured.

**Fix needed:** Use `APP_BASE_URL` and configure Universal Links / Associated Domains.

---

## MEDIUM PRIORITY (Degraded UX)

### 11. QR Code Download
**File:** `src/components/QRCodeModal.tsx` lines 41-57
The `handleDownload()` function creates a download link via `document.createElement('a')` with a `download` attribute. This doesn't work in WKWebView -- the download will be silently ignored.

**Fix needed:** Use `@capacitor/filesystem` to save to device, or `@capacitor/share` to share the image.

---

### 12. `navigator.share()` -- Works But Different
**Files:** `src/components/InviteFriendsSection.tsx` line 109-112, `src/components/VenueIdCard.tsx` line 562, `src/components/QRCodeModal.tsx` line 26, `src/pages/Profile.tsx` line 311, `src/pages/Feed.tsx` line 400, `src/components/EventCard.tsx` line 131, `src/pages/Home.tsx` line 581, `src/components/FindFriendsOnboarding.tsx` line 148

`navigator.share()` IS supported in WKWebView on iOS 15+, so these will work. However, the shared URLs will still be broken (see issue #5 above).

---

### 13. `navigator.onLine` -- Unreliable
**File:** `src/hooks/useOfflineCache.ts` line 49
`navigator.onLine` in WKWebView may not accurately reflect network state. Consider using `@capacitor/network` plugin.

---

### 14. `navigator.permissions.query()` -- Not Supported
**File:** `src/lib/location-service.ts` lines 65-70
The Permissions API (`navigator.permissions`) is not available in WKWebView. The fallback to `'prompt'` (line 67) is correct, so this won't crash, but the permission state detection won't work.

---

### 15. Location Permission Prompt -- Chrome-Specific Help
**File:** `src/components/LocationPermissionPrompt.tsx` line 121
Opens a Chrome help page for enabling location. On iOS this should link to iOS Settings or show iOS-specific instructions.

---

## LOW PRIORITY (Minor / Already Handled)

### 16. `localStorage` Usage -- SAFE
**Files:** 18+ files using localStorage
`localStorage` works fine in WKWebView and persists correctly in Capacitor iOS. The Supabase client using `localStorage` for auth persistence (client.ts line 13) is fine. No changes needed.

---

### 17. `document.visibilitychange` -- SAFE
**File:** `src/lib/auto-venue-tracker.ts` lines 33-37
Works correctly in WKWebView for detecting app backgrounding.

---

### 18. Mapbox GL -- SAFE with Caveats
**File:** `src/pages/Map.tsx` (throughout)
WebGL is supported in WKWebView on iOS. Mapbox GL JS works in Capacitor. The DOM marker approach (`document.createElement('div')`) used throughout Map.tsx is fine. Touch events work natively. One caveat: performance may be slightly lower than native MapKit, and you should test with many markers.

---

### 19. `navigator.geolocation` -- SAFE
**Files:** `src/lib/location-service.ts`, `src/components/CheckInModal.tsx`, `src/pages/DemoSettings.tsx`, `src/lib/city-detection.ts`, `src/pages/Map.tsx`
`navigator.geolocation` works in WKWebView. However, you need to add `NSLocationWhenInUseUsageDescription` to Info.plist in Xcode. You can optionally upgrade to `@capacitor/geolocation` for better native integration.

---

### 20. CSS Safe Area Insets -- SAFE
**Files:** `src/components/Layout.tsx`, `src/components/BottomNav.tsx`, `src/pages/Map.tsx`, `src/index.css`, and 6+ other files
The `env(safe-area-inset-*)` usage is correct and comprehensive. The viewport meta tag in `index.html` includes `viewport-fit=cover` which is required. The iOS config in `capacitor.config.ts` sets `contentInset: 'automatic'`. This is all properly configured.

---

### 21. `100dvh` -- SAFE
**File:** `src/components/Layout.tsx` line 71
`100dvh` is supported in iOS Safari / WKWebView from iOS 15.4+. Should be fine.

---

## Summary: Action Items Before TestFlight

| Priority | Issue | Effort |
|----------|-------|--------|
| BLOCKER | OAuth redirect_uri fix | Medium -- need Universal Links or custom scheme |
| BLOCKER | Native push via @capacitor/push-notifications | Medium -- plugin + APNs cert config |
| HIGH | Replace window.location.origin in share URLs with hosted URL | Low -- create constant, find/replace |
| HIGH | Replace window.location.href navigation with React Router | Low |
| HIGH | Replace window.open with @capacitor/browser | Low |
| MEDIUM | Replace navigator.vibrate with @capacitor/haptics | Low |
| MEDIUM | Replace navigator.clipboard with @capacitor/clipboard | Low |
| MEDIUM | Fix QR download for iOS | Low |
| MEDIUM | Fix password reset / email confirm redirect URLs | Low |
| LOW | iOS-specific location permission instructions | Low |
| LOW | Network status via @capacitor/network | Low |

