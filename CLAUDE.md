# Spotted — Development Notes

## Camera Architecture

Camera is a **native UIKit fullscreen modal** (`SpottedCameraPlugin.swift` + `.m`).

- **Triggered from JS** via `openSpottedCamera()` in `src/lib/spotted-camera.ts`
- **Returns** captured media to caller via promise: `{ type, file, previewUrl }`
- **All UI is native UIKit** — buttons, gestures, animations are in Swift, not React
- **Features:** tap-to-photo, hold-to-record (14s max), flip button + double-tap flip with fade, flash toggle (off/on), close/dismiss
- **Gallery button** is intentionally removed (was a stub). Gallery access is via the web fallback in `PostMediaPicker`.

### Files

| File | Purpose |
|------|---------|
| `ios/App/App/SpottedCameraPlugin.swift` | Native camera VC + Capacitor plugin bridge |
| `ios/App/App/SpottedCameraPlugin.m` | Obj-C plugin registration |
| `src/lib/spotted-camera.ts` | JS wrapper — calls native plugin, converts file path to File+URL |
| `src/components/PostMediaPicker.tsx` | Entry point — calls `openSpottedCamera()` on native, shows gallery fallback on web |

### Do NOT reintroduce

- `@capgo/camera-preview` — removed, was the old webview-overlay camera
- `WebViewTransparencyPlugin` — removed, was only needed for webview-overlay approach
- `CameraTest.tsx` / `/camera-test` route — removed, was the old camera page

## Header Patterns

- **Newsfeed & Plans**: Both have a collapsing header. The page title and tagline collapse on scroll. The "Spotted" wordmark, city pill, search, notification bell, and S logo are anchored and do not animate. The Newsfeed/Plans tab toggle is inside the sticky header.
- **Other pages** (Map, Chat, Profile, Leaderboard): Do not have collapsing headers. Static headers only.
- Implementation is inline in `src/pages/Home.tsx`, not a shared component. If a second page needs the same pattern, do not extract a component until that second page is built — duplicate the pattern first, abstract on the third use.
- Padding and sizing of the expanded header have not been intentionally changed and should not be changed without an explicit task.
