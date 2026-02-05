
## Fix Map-Promoted Venues Not Appearing Special

### Problem Analysis

The user promoted "Spotlight LA" on the map, but it doesn't look special. Two issues were identified:

| Issue | Description |
|-------|-------------|
| **Marker not updating** | When a marker already exists, only its position is updated, not its HTML/styling. If the venue was on the map before being promoted, it keeps old styling. |
| **Promoted venues filtered out** | At lower zoom levels, venues are filtered by heat score. Promoted venues with low popularity rank can be cut from the visible set. |

---

### Solution

1. **Force re-create markers when promotion status changes**
2. **Always include map-promoted venues regardless of zoom/heat filtering**
3. **Ensure promoted venues have higher z-index to stay visible**

---

### Code Changes

**File: `src/pages/Map.tsx`**

**Change 1: Always include map-promoted venues in filtered list (around line 764-769)**

```text
Before:
  const typeFilteredVenues = venueFilter === 'all' 
    ? venues 
    : venues.filter(v => v.type === venueFilter);
  
  const visibleCount = getVisibleVenueCount(currentZoom);
  const filteredVenues = typeFilteredVenues.slice(0, visibleCount);

After:
  const typeFilteredVenues = venueFilter === 'all' 
    ? venues 
    : venues.filter(v => v.type === venueFilter);
  
  const visibleCount = getVisibleVenueCount(currentZoom);
  
  // Separate promoted venues - they're always visible
  const mapPromotedVenues = typeFilteredVenues.filter(v => v.is_map_promoted);
  const nonPromotedVenues = typeFilteredVenues.filter(v => !v.is_map_promoted);
  
  // Combine: promoted venues first (always shown), then top non-promoted by heat
  const filteredVenues = [
    ...mapPromotedVenues,
    ...nonPromotedVenues.slice(0, Math.max(0, visibleCount - mapPromotedVenues.length))
  ];
```

**Change 2: Re-create marker if promotion status changed (around line 788-793)**

The existing marker logic needs to check if the visual styling should change:

```text
Before:
  if (existingMarker) {
    // Update existing marker position only (no recreation)
    existingMarker.setLngLat([venue.lng, venue.lat]);
  } else {

After:
  // Check if marker needs visual update (promotion status changed)
  const markerNeedsRestyle = existingMarker && 
    existingMarker.getElement().dataset.promoted !== String(venue.is_map_promoted || false);
  
  if (existingMarker && !markerNeedsRestyle) {
    // Update existing marker position only (no recreation)
    existingMarker.setLngLat([venue.lng, venue.lat]);
  } else {
    // Remove old marker if it needs restyling
    if (existingMarker) {
      existingMarker.remove();
      venueMarkersRef.current.delete(venue.id);
    }
```

Also add data attribute when creating marker:
```text
  el.dataset.promoted = String(isMapPromoted);
```

---

### Visual Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| Venue promoted while map open | Old plain styling | Immediately shows glow + star |
| Low-popularity promoted venue | May disappear at low zoom | Always visible |
| Multiple promoted venues | Mixed visibility | All always shown at top of list |

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Map.tsx` | Fix venue filtering to always include promoted venues; add marker restyling detection |
