

# Fix Map Pin Overlap, Sizing, and Visibility

## Problem
Friend avatar pins on the map overlap and stack on top of each other when multiple friends are at the same or nearby venues. Pins are too large, avatars are hard to see against the dark map, and z-index priority for close friends is not enforced.

## Current State (in `src/pages/Map.tsx`)
- **Clustering**: Only triggers at 4+ friends within 5m (`CLUSTER_THRESHOLD = 0.000045`). Groups of 2-3 just get a small lng offset (`0.00015`) which still causes heavy overlap.
- **Pin size**: Individual avatar markers are `52x52px` with `3px` padding inside the border ring. Too large.
- **Avatar visibility**: Avatar images sit directly on a dark background with only a thin colored ring border (2px) that blends with the dark map.
- **Z-index**: All friend markers use `z-index: 10` regardless of relationship type. Close friends don't render on top.

## Changes (1 file: `src/components/../pages/Map.tsx`)

### 1. Lower the clustering threshold from 4 to 2
- Change the cluster condition on line 714 from `cluster.length >= 4` to `cluster.length >= 2`
- When 2+ friends are within the 5m threshold, show a single cluster pin with a count badge instead of stacked individuals
- Cluster pin: show top 1-2 avatars stacked with a `+N` badge (adjust the existing cluster HTML for 2-3 friend clusters to show a simpler layout)
- For 2-3 friend clusters, show the first friend's avatar with a count badge overlay (simpler than the current 3-avatar triangle layout)
- Keep the existing popover-on-tap behavior for expanding the cluster

### 2. Reduce pin sizes by ~25%
- Individual avatar marker: `52px` → `40px` (container), avatar padding adjusted proportionally
- Cluster marker (4+): `70px` → `56px`
- Small cluster (2-3): use `46px` container
- User marker stays unchanged (it's the "me" pin and should stand out)
- Venue pins: reduce `containerSize` from 50 → 40 and `pinSize` from 38 → 30 (non-promoted); promoted stays slightly larger at 50/38

### 3. Add bright border for avatar visibility
- Add a `2px solid white` border on the `<img>` element inside each avatar marker (in addition to the existing relationship color ring)
- This creates a double-ring effect: outer ring = relationship color, inner ring = white, making avatars pop against the dark map
- Apply the same white inner border to cluster avatar thumbnails

### 4. Z-index by relationship type
- Close friends: `z-index: 14`
- Direct friends: `z-index: 11`
- Mutual friends: `z-index: 10`
- Clusters containing a close friend: `z-index: 14`
- This ensures close friend pins always render on top when overlapping with other friend pins
- Venue pins remain at `z-index: 12` (non-promoted) and `30` (promoted), user marker at `15`

### 5. Small cluster rendering (2-3 friends)
Instead of offset individual pins for 2-3 friends, render a compact cluster:
- Show the highest-priority friend's avatar (close > direct > mutual) as the main image
- Overlay a small count badge (e.g., circle with "2" or "3") in bottom-right
- Tap opens the same cluster popover showing the full list

## Technical Details

All changes are in `src/pages/Map.tsx` in the `useEffect` that renders friend markers (lines ~612-771):

```text
Current flow:
  friends → group by proximity → if 4+: cluster bubble | if 1-3: offset individuals

New flow:
  friends → group by proximity → if 2+: cluster with count badge | if 1: single avatar
  
Pin sizes:
  Individual: 52px → 40px
  Cluster 2-3: new 46px compact pin  
  Cluster 4+: 70px → 56px
  Venue (normal): 50px → 40px
  Venue (promoted): 60px → 50px (container), stays prominent

Z-index hierarchy:
  30: promoted venues
  15: user marker
  14: close friend pins / clusters with close friends
  12: venue pins
  11: direct friend pins
  10: mutual friend pins
```

No database changes, no new files, no dependency changes needed.

