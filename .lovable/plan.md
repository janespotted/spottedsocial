

## Fix: Map crashes with "Style is not done loading"

The clustering code added in the previous change calls `map.addSource()` and `map.addLayer()` without checking if the Mapbox style has finished loading. When the useEffect fires before style load completes, it throws "Style is not done loading" and the PageErrorBoundary catches it.

### Change (`src/pages/Map.tsx`)

In the venue markers useEffect (line ~1057), add an early return if the style isn't loaded:

```typescript
if (!map.current) return;
const m = map.current;
if (!m.isStyleLoaded()) return;  // ← add this guard
```

Also guard the `layerVisibility === 'friends'` cleanup block similarly — `removeLayer`/`removeSource` also require style to be loaded:

```typescript
if (layerVisibility === 'friends') {
  venueMarkersRef.current.forEach(marker => marker.remove());
  venueMarkersRef.current.clear();
  if (m.isStyleLoaded()) {
    if (m.getLayer('venue-cluster-count')) m.removeLayer('venue-cluster-count');
    if (m.getLayer('venue-clusters')) m.removeLayer('venue-clusters');
    if (m.getLayer('venue-unclustered')) m.removeLayer('venue-unclustered');
    if (m.getSource('venues-source')) m.removeSource('venues-source');
  }
  return;
}
```

This is a two-line fix that prevents the crash entirely. The useEffect will re-run when venues/map state changes, and by that time the style will be loaded.

