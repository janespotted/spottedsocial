

# Fix: Skip Confirmation Dialog Stuck / Unclickable

## Root Cause

The skip confirmation dialog in `FindFriendsOnboarding.tsx` has a z-index conflict. Here's what's happening:

1. The `DialogContent` component (from `dialog.tsx`) automatically renders a `DialogOverlay` inside itself at `z-[500]`
2. The code ALSO renders an explicit `<DialogOverlay>` at `z-[200]`
3. The `DialogContent` itself is set to `z-[200]`

This means: the auto-rendered overlay sits at `z-[500]`, covering the dialog content at `z-[200]`. The "Skip anyway" button is visually visible but trapped behind an invisible overlay -- exactly matching your screenshot where the screen grays out but nothing is clickable.

## Fix (1 file)

**File: `src/components/FindFriendsOnboarding.tsx`**

1. Remove the separate `<DialogOverlay>` element (lines 471) -- the one inside `DialogContent` already handles the overlay
2. Update the `DialogContent` z-index to be above the onboarding screen's `z-[100]`, using `z-[500]` to match the app's modal hierarchy standard

Changes at lines 461-506:
- Remove the standalone `<DialogOverlay className="bg-black/80 backdrop-blur-sm z-[200]" />` line
- Change DialogContent's class from `z-[200]` to `z-[500]`

This ensures the dialog and its overlay render at the same z-level, making all buttons clickable.

