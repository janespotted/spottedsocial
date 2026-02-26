

# Move Search to Header Bar

## Overview
Move the floating search FAB from the bottom-left corner into the top header bar, next to the bell and S icons.

## Changes (Home.tsx only)

### 1. Add search icon to header (lines 286-301)
Replace the existing header icon group with three icons in order (right to left): S logo, bell, search.

The search button uses the same `w-10 h-10 rounded-full` sizing, with `text-white/60 hover:text-white transition-colors` styling to match the existing header icon treatment. It triggers `setShowFriendSearch(true)`.

### 2. Remove floating search FAB (lines 615-622)
Delete the entire `{/* Friend Search FAB */}` block — the fixed-position button at the bottom-left.

## File Modified
- `src/pages/Home.tsx` — two edits, no new files

