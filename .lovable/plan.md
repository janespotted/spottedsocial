

## Fix: West side venues missing + orphaned pin dots

### Root cause

1. **Missing west side venues**: `getVisibleVenueCount()` limits displayed venues by heat score ranking. At zoom 12 only 50 venues show, at zoom 13 only 100. Since venues are sorted by `heatScore` descending and west side venues have 0 heat (no check-ins), they get sliced off. Santa Monica (30), Venice (30), Manhattan Beach (19) = 79 venues that never make the cut until zoom 15+.

2. **Orphaned dots**: The `venue-unclustered` layer renders individual purple circles (8px radius, no icon/badge). These are venues that aren't within any cluster radius at that zoom level — they look like stray dots because they're small circles with no label. This is expected clustering behavior but looks buggy.

### Changes

#### 1. Remove `visibleCount` slicing — let clustering handle density (`src/pages/Map.tsx`)

The whole point of clustering is to handle venue density at any zoom level. The `getVisibleVenueCount` function was designed for DOM-based markers (performance concern). With GeoJSON source + native clustering, Mapbox handles thousands of features efficiently. 

- Remove `getVisibleVenueCount` function (lines 1028-1035)
- Change `filteredVenues` to include ALL `typeFilteredVenues` (no slicing):
  ```typescript
  const filteredVenues = typeFilteredVenues;
  ```
- Remove the `visibleCount` variable and the promoted/non-promoted slicing logic (lines 1042-1052)
- Keep promoted venue separation only inside the useEffect for DOM marker rendering

#### 2. Improve unclustered pin styling to not look orphaned (`src/pages/Map.tsx`)

Make individual unclustered pins more visible and consistent with cluster circles:
- Increase `circle-radius` from 8 to 10
- Add a subtle label for unclustered pins or increase stroke width to 2 to match cluster styling
- This makes solo pins look intentional rather than like rendering artifacts

### Technical note

With clustering enabled, Mapbox GL internally tiles and indexes the GeoJSON data using supercluster. 339 venues is trivial — even 10,000+ features perform well. The per-zoom slicing was only needed for the old DOM marker approach.

