

# Fix: Photo Screens Cut Off in PWA Mode

## Problem

When in PWA (standalone) mode, the status bar overlaps the top of fullscreen photo screens (PhotoFilterScreen, PostMediaPicker, PostCaptionScreen, StoryCaptureScreen, StoryEditor). This hides the close/check/share buttons, making them untappable.

## Solution

Add `padding-top: env(safe-area-inset-top, 0px)` to the top-level container of each fullscreen photo screen. In non-PWA (browser) mode, `env(safe-area-inset-top)` resolves to `0px`, so there is zero visual impact outside of PWA mode.

## Files to Change

| File | Change |
|------|--------|
| `src/components/PhotoFilterScreen.tsx` (line 106) | Add `pt-[env(safe-area-inset-top,0px)]` to the outer `div` |
| `src/components/PostMediaPicker.tsx` (line ~97) | Add `pt-[env(safe-area-inset-top,0px)]` to the outer `div` |
| `src/components/PostCaptionScreen.tsx` (line 213) | Add `pt-[env(safe-area-inset-top,0px)]` to the outer `div` |
| `src/components/StoryCaptureScreen.tsx` (line ~131) | Add `pt-[env(safe-area-inset-top,0px)]` to the outer `div` |
| `src/components/StoryEditor.tsx` | Add `pt-[env(safe-area-inset-top,0px)]` to the outer `div` |

Each change is a single class addition to the root `<div className="fixed inset-0 ...">` element. No other code is modified.

## Why This Is Safe for Non-PWA Mode

The CSS `env(safe-area-inset-top, 0px)` function returns `0px` when safe area insets aren't defined (i.e., in a regular browser tab). This means zero extra padding is applied outside of PWA/standalone mode -- the layout is completely unchanged.

