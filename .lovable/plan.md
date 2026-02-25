

# Fix Map Top Bar Layout

## Problem
The search bar currently spans full width (`left-4 right-4`) with a heavy purple background, making it look like a solid header bar rather than a floating map control. The filter icon is inside the bar but visually disconnected. The status pill below also takes too much space.

## Changes — all in `src/pages/Map.tsx`

### 1. Search Bar (lines 1228-1245)
Make it compact and floating:
- Width: ~65% of screen, not full width. Use `max-w-[280px]` instead of spanning `left-4 right-4`
- Height: `h-10` (40px) with `py-2` instead of `py-3`
- Position: left-aligned below header, `left: 16px` only (remove `right-4`)
- Background: `bg-black/50 backdrop-blur-md` with `border border-white/15` — semi-transparent dark, not the heavy purple `bg-[#2d1b4e]/90`
- Rounded: `rounded-full` for a pill shape
- Remove the inner `shadow-[0_0_10px_...]` glow

### 2. Filter Icon (inside search bar, lines 1238-1243)
- Pull it out of the search bar and make it a separate 40px circle button
- Position it directly to the right of the search bar with a small gap
- Same `bg-black/50 backdrop-blur-md border border-white/15` style
- `rounded-full w-10 h-10`

### 3. Status Pill (lines 1282-1349)
- Make it smaller: reduce padding to `px-2.5 py-1`, smaller text `text-[11px]`
- Position just below the search bar, left-aligned
- Use the same `bg-black/50 backdrop-blur-md border border-white/15` instead of the colored backgrounds
- Keep the colored text for status differentiation but make the pill background neutral
- The "Stop Sharing" button stays inline but also gets the same neutral dark style

### 4. Smart Prompt Banner (lines 1247-1280)
- Adjust top position to account for the shorter search bar
- Reduce to `top: calc(8.5rem + env(safe-area-inset-top))` (was 10rem)

### Specific code changes

**Search bar container** (line 1229): Change `left-4 right-4` to `left-4 flex items-center gap-2`

**Search bar button** (lines 1232-1244): Split into two elements:
- Search pill: `max-w-[260px] h-10 bg-black/50 backdrop-blur-md border border-white/15 rounded-full px-3 py-2` with smaller text
- Filter button: separate `w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/15`

**Status pill** (lines 1288-1314): Reduce to `px-2.5 py-1` padding, `text-[11px]` font size, `bg-black/40 backdrop-blur-md border border-white/10` background for all states. Keep colored text only.

**Stop Sharing button** (lines 1318-1346): Same neutral dark treatment `bg-black/40 border border-white/10`.

**Top offset** (line 1230): Adjust to `top: calc(5.5rem + env(safe-area-inset-top))` to sit tighter under the header.

**Status pill top** (line 1286): Adjust accordingly to sit below the smaller search bar.

## What stays untouched
- Header row (Spotted logo, city badge, bell, check-in button)
- "No friends out" pill in bottom-left
- Relationship legend in bottom-right
- My Location button
- All map pins, markers, clustering
- Full-screen search overlay (only triggered on tap)
- Filter drawer content
- Bottom navigation

## Files modified
- `src/pages/Map.tsx` only

