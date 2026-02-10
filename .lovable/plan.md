

# Fix: Content Cut Off at Top in PWA Standalone Mode

## Problem

When running as a PWA (Add to Home Screen), iOS removes the browser chrome and the app content renders behind the status bar. The Layout component only accounts for `safe-area-inset-bottom` (for the home indicator) but not `safe-area-inset-top` (for the notch/Dynamic Island area). The Map page handles this on its own, but every other page (Home, Leaderboard, Profile, etc.) gets clipped.

## Fix

### File: `src/components/Layout.tsx`

Add top safe area padding to the outer wrapper div, but skip it for the Map page (which already handles its own insets):

```typescript
<div className={cn(
  "min-h-[100dvh] bg-background flex flex-col",
  !isMapPage && "pb-[calc(4rem+env(safe-area-inset-bottom,0px))]",
  !isMapPage && "pt-[env(safe-area-inset-top,0px)]"
)}>
```

This single line addition ensures all non-map pages get proper top padding in PWA standalone mode, while having zero effect in a normal browser (where `safe-area-inset-top` is `0px`).

| File | Change |
|------|--------|
| `src/components/Layout.tsx` | Add `pt-[env(safe-area-inset-top,0px)]` to the wrapper div for non-map pages |

One line. Fixes all pages at once.
