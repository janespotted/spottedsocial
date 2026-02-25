

# Fix Search Overlay Buttons Not Responding to Taps

## Problem
The "People" and "Venues" filter buttons in the search overlay don't respond to taps on mobile devices. Two issues combine:

1. **Map bleeding through**: The overlay uses `bg-[#0a0118]/95` (95% opacity), and Mapbox GL markers are rendered as real DOM nodes that sit in a separate stacking context. On mobile, touch events can pass through to the map layer underneath.

2. **No visible feedback on default state**: When the search query is empty, toggling People/Venues filters has zero visual effect on the content below (Trending Tonight and Friends Out Now always show regardless). Users tap the button, the style toggles, but nothing changes — so it feels broken.

## Changes — all in `src/pages/Map.tsx`

### 1. Make overlay fully opaque and block map interaction
- Change the overlay background from `bg-[#0a0118]/95` to `bg-[#0a0118]` (fully opaque, no transparency)
- Add `pointer-events-auto` explicitly on the overlay and `touch-action: auto` to ensure mobile touches are captured
- This prevents mapbox markers from intercepting touch events

### 2. Apply People/Venues filters to the default (no-query) view too
Currently when `searchQuery.length === 0`, both "Trending Tonight" (venues) and "Friends Out Now" (people) sections always render regardless of filter state. Fix:
- Only show "🔥 Trending Tonight" when `searchFilterVenues` is true
- Only show "👥 Friends Out Now" when `searchFilterPeople` is true
- This gives immediate, visible feedback when tapping the filter chips even without a search query

### 3. Add `e.stopPropagation()` to filter chip buttons
As a defensive measure, add `e.stopPropagation()` to the People and Venues button `onClick` handlers to prevent any event bubbling to parent elements or the map.

## Files modified
- `src/pages/Map.tsx` only

