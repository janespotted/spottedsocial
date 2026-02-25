

# Consolidate Map Search & Filter Controls

## Summary
Replace the 4 separate top-of-map controls (Search button, Explore dropdown, All Venues filter, Both/People/Venues toggle) with a single unified search bar. Tapping it opens a full-screen search overlay with smart filtering, trending venues, and friends out. A small filter icon on the search bar opens a quick-filter bottom sheet for show mode (Everyone / Close Friends Only / Friends Only).

## What gets removed (lines 1148-1318 in Map.tsx)
1. **Search button/input** (lines 1148-1181) - the `🔍 Search` pill and inline input
2. **Search results dropdown** (lines 1183-1209) - the floating venue results
3. **Venue type filter** (lines 1211-1269) - the `All Venues` / Clubs / Cocktails / Bars / Rooftops dropdown
4. **Layer visibility toggle** (lines 1271-1318) - the `Both` / 👤 / 📍 segmented control

## What stays untouched
- **Bottom-left**: "X friends out" pill + expanded friends list (lines 1410-1541)
- **Bottom-right**: Relationship legend (lines 1554-1577)
- **Bottom-right**: My Location button (lines 1544-1552)
- **All map pins**, avatars, clustering, venue markers
- **Header** with "Spotted" title, city badge, bell, check-in button

## New UI Elements

### 1. Collapsed search bar (replaces all 4 controls)
- Single rounded bar below the header, spanning most of the width with horizontal margins
- Placeholder: "Search people, venues, or neighborhoods..."
- Left side: search icon
- Right side: small funnel/filter icon button
- Same glass-morphism style as existing controls (`bg-[#2d1b4e]/90 backdrop-blur border border-[#a855f7]/30`)
- Position: `top: calc(6.5rem + env(safe-area-inset-top))`, `left: 16px`, `right: 16px`

### 2. Full-screen search overlay (on tap of search bar)
- Covers the map with a dark overlay (`bg-[#0a0118]/95`)
- Fixed position, `z-index: 500`
- Top: text input with auto-focus, back arrow to close
- Below input: two filter chips — "People" and "Venues" (both active by default, tap to toggle)
- **When no query typed** (default state):
  - "Trending Tonight" section: top 3 venues sorted by `heatScore` from the existing `venues` state, each showing name + neighborhood + type emoji
  - "Friends Out Now" section: list of friends from the existing `friends` state, showing avatar + name + venue
- **When query is typed**:
  - "People" section: filter `friends` array by `display_name` matching query (only if People chip active)
  - "Venues" section: filter `venues` array by `name` or `neighborhood` matching query (only if Venues chip active)
- Tapping a person result: close overlay, fly map to their pin coordinates, open friend card
- Tapping a venue result: close overlay, fly map to venue, open venue card

### 3. Quick-filter bottom sheet (on tap of funnel icon)
- Uses the existing `Drawer` component from `src/components/ui/drawer.tsx`
- Title: "Show on Map"
- Three radio-style options:
  - **Everyone** (default) — sets `layerVisibility = 'both'` and no relationship filter
  - **Close Friends Only** — sets a new `relationshipFilter = 'close'` state, filters friend markers to only close friends
  - **Friends Only** — sets `layerVisibility = 'friends'` (hides venue pins)
- Also includes venue type filter section below: All / Clubs / Cocktails / Bars / Rooftops (migrating the existing venue filter into this sheet)

## State Changes
- Remove: `showSearch`, `showVenueFilters`, `showVenueList` states
- Add: `showSearchOverlay: boolean`, `showFilterSheet: boolean`, `searchFilterPeople: boolean` (default true), `searchFilterVenues: boolean` (default true), `relationshipFilter: 'all' | 'close' | 'friends_only'` (default 'all')
- Keep: `searchQuery`, `venueFilter`, `layerVisibility` (repurposed internally)
- Remove refs: `searchContainerRef`, `venueFilterRef`, `venueListRef`

## Impact on existing marker rendering
- The `relationshipFilter` state will be used in the friend markers `useEffect` (line 612+) to filter which friends get rendered:
  - `'all'`: show all friends + venues (current `'both'` behavior)
  - `'close'`: only render friends where `relationshipType === 'close'`, still show venues
  - `'friends_only'`: show all friends, hide venues (current `'friends'` behavior)
- The `venueFilter` continues to work as-is for venue type filtering
- The click-outside handler (lines 1024-1054) simplified since fewer dropdowns exist

## Technical Details

```text
Current top controls layout:
  Row 1 (top: 7rem):  [🔍 Search]  ........  [🗺️ All Venues ▾]
  Row 2 (top: 9.5rem): [📍 Explore ▾]  .....  [Both | 👤 | 📍]

New layout:
  Row 1 (top: 6.5rem):  [🔍 Search people, venues, or neighborhoods...  🔽]
  (everything else is in overlays/sheets)

State flow:
  Tap search bar → showSearchOverlay = true → full screen search
  Tap funnel icon → showFilterSheet = true → Drawer with filter options
  Select filter option → update relationshipFilter/venueFilter/layerVisibility → close sheet
  Tap search result → close overlay, fly to location, open card

Files modified: src/pages/Map.tsx only
No new files, no DB changes, no new dependencies
```

## File: `src/pages/Map.tsx`

1. **Remove** old state variables: `showSearch`, `showVenueFilters`, `showVenueList` and their refs
2. **Add** new state: `showSearchOverlay`, `showFilterSheet`, `searchFilterPeople`, `searchFilterVenues`, `relationshipFilter`
3. **Add** import for `Drawer, DrawerContent, DrawerHeader, DrawerTitle` and `Filter` icon from lucide
4. **Remove** the 4 control blocks (lines 1148-1318) and search results dropdown (lines 1183-1209)
5. **Add** collapsed search bar JSX in their place
6. **Add** full-screen search overlay JSX (rendered conditionally)
7. **Add** filter Drawer JSX (rendered conditionally)
8. **Update** friend marker rendering to respect `relationshipFilter`
9. **Update** click-outside handler to remove references to deleted refs
10. **Keep** all bottom elements (friends pill, legend, my-location button) exactly as-is

