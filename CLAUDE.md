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

## Capacitor Keyboard Behavior (CRITICAL)

The Capacitor config uses `resize: 'native'`. This is the most important fact about keyboard handling in this app:

**WITH RESIZE: NATIVE:**
- iOS automatically shrinks the webview when keyboard opens
- The visible viewport (`window.innerHeight`) decreases by the keyboard's height
- `position: fixed; bottom: 0` already sits above the keyboard automatically — no JS needed
- **DO NOT** add `keyboardHeight` to `bottom` values. This double-counts and pushes elements up by an extra keyboard's worth of pixels.

**CORRECT pattern** for elements that should sit above the keyboard:
```css
style={{ bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}
```

**WRONG pattern** (causes double-count bug):
```css
style={{ bottom: keyboardHeight }}
```

`useKeyboardAware` hook STILL HAS valid uses (e.g., conditional rendering, animations triggered by keyboard state, hiding/showing the FAB). Just don't use its `keyboardHeight` value to position fixed elements relative to the bottom.

This bug has been "fixed" multiple times in this codebase. The underlying issue was always double-counting: native resize + JS offset. This pattern is now documented to prevent regression.

## Demo Mode (CRITICAL SAFETY RULES)

Demo mode seeds 24 fake users + content for testing. Real and demo data coexist in the same tables, distinguished by `is_demo` column.

**SAFETY RULES:**

1. Demo venue names MUST be distinct from real venues. All demo venues use a `(Demo)` suffix (e.g., "Academy LA (Demo)"). NEVER use `onConflict:'name'` upsert for venues — this can promote real venues to demo and cause data loss when demo is cleared.

2. Friendship clears must use IN clauses scoped to demo user IDs on both sides. The current logic is correct: only delete where `user_id` OR `friend_id` is in the demo set.

3. Before any clear operation, the function logs counts of preserved real data. This is a sanity check — if those counts drop unexpectedly, that signals data loss.

4. Demo data expiry is set to 30 days from seeding (not 5am tonight). This ensures demo content persists across sessions.

5. The seed function creates friendships between the seeding user and all 24 demo users. If the user has no real friends, demo mode is the only way to populate their friend graph for testing.

**Past bugs to prevent regression:**
- Venue upsert promoting real venues to demo (fixed: distinct names with "(Demo)" suffix)
- Demo clear deleting all friendships (fixed: scoped to demo IDs only)
- Demo night_statuses expiring at 5am (fixed: 30-day expiry)
- Seed never running after clear, leaving empty state (user must explicitly re-seed from Demo Settings)
