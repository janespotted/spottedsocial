

# Fix Overlapping Elements on Yap Prompt Card

## Problem
In `src/components/CheckInConfirmation.tsx` (the "yap_prompt" phase, lines 162-210), the ✨ emoji and Spotted S logo are absolutely positioned at `top-6 left-6` and `top-6 right-6` respectively. The title text "What's [Venue] like tonight?" starts with only `mt-4` top margin, causing it to collide with these corner decorations — especially when the venue name is long and wraps to multiple lines.

## Fix
In `src/components/CheckInConfirmation.tsx`, line 181:

- Increase `mt-4` on the center content div to `mt-12` so the title text clears below the absolutely positioned corner elements
- This single change gives enough vertical clearance for the ✨ and S logo without altering their positions

**File:** `src/components/CheckInConfirmation.tsx` — line 181, change `mt-4 mb-6` → `mt-12 mb-6`

