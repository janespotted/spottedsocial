

## Plan: Fix Venue Coordinates + Add Venue Pin Clustering

### Prompt 1: Fix LA venue coordinates

268 LA venues have fake linearly-spaced coordinates. The best approach is a new edge function that batch-lookups real coordinates via Google Places API.

#### 1. Create edge function `fix-venue-coordinates`
- New file: `supabase/functions/fix-venue-coordinates/index.ts`
- Queries all venues where `is_user_submitted = false AND google_place_id IS NULL AND city = 'la'`
- For each venue, calls Google Places `findplacefromtext` with `name + neighborhood` and `locationbias` near current coords
- Updates `lat`, `lng`, and `google_place_id` with the real result
- Processes in batches of 10 with delays to avoid rate limits
- Uses service role key for DB writes
- Returns a summary of updated/failed venues
- Add to `config.toml`: `[functions.fix-venue-coordinates] verify_jwt = false`

#### 2. Immediate stopgap: random jitter migration
While the edge function is built, also run a SQL update adding random jitter (±0.002°, ~200m) to break the diagonal lines immediately:

```sql
UPDATE venues
SET lat = lat + (random() - 0.5) * 0.004,
    lng = lng + (random() - 0.5) * 0.004
WHERE is_user_submitted = false
  AND google_place_id IS NULL
  AND city = 'la';
```

This makes the map usable now. The edge function replaces jittered coords with real ones when invoked.

---

### Prompt 2: Add venue marker clustering

The map currently uses individual Mapbox markers for venues (DOM-based). For clustering, switch venue rendering to a Mapbox GL GeoJSON source + circle/symbol layers with built-in clustering.

#### 1. Replace DOM-based venue markers with Mapbox GL source+layers (`src/pages/Map.tsx`)

In the venue marker `useEffect` (lines ~1054-1150):

- Remove the DOM marker creation loop
- Instead, build a GeoJSON `FeatureCollection` from `filteredVenues`
- Add/update a Mapbox source `venues-source` with `cluster: true, clusterMaxZoom: 14, clusterRadius: 50`
- Add three layers:
  - `venue-clusters`: circle layer for clustered points (purple circles with white count text)
  - `venue-cluster-count`: symbol layer showing the count number
  - `venue-unclustered`: circle layer for individual pins (existing purple dot style)
- On cluster click: zoom in with `getClusterExpansionZoom`
- On individual pin click: call `openVenueCard(venue.id)` using feature properties
- Handle promoted venues: render promoted venues as separate DOM markers on top (they bypass clustering)

#### 2. Clean up venue marker refs
- Remove `venueMarkersRef` usage for non-promoted venues (layers handle rendering)
- Keep DOM markers only for promoted venues (they need special styling/z-index)

#### 3. Track zoom changes for cluster updates
- The existing `currentZoom` state and `getVisibleVenueCount` logic stays — just drives the GeoJSON source data instead of DOM markers

### Technical details

- Mapbox GL JS has built-in clustering support via `addSource` with `cluster: true` — no extra library needed
- Cluster circles use the existing purple theme (`#a855f7`)
- Individual unclustered pins match the current 30px purple dot style
- Cluster click handler uses `map.getSource('venues-source').getClusterExpansionZoom()` to zoom smoothly

