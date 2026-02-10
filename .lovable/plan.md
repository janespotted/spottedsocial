
# Increase Venue Visibility on Map

## Change

Update the zoom-based venue count thresholds in `src/pages/Map.tsx` so the map feels more populated at every zoom level.

**File: `src/pages/Map.tsx`** -- Update `getVisibleVenueCount`:

| Zoom Level | Current | New |
|-----------|---------|-----|
| < 11 (city overview) | 5 | 25 |
| < 12 (wide view) | 15 | 50 |
| < 13 (neighborhood) | 30 | 100 |
| < 14 (closer) | 60 | 150 |
| < 15 (close) | 100 | 200 |
| 15+ | All | All (unchanged) |

Single function change, no other files affected.
