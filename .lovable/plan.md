

## ✅ COMPLETED: Add Layer Visibility Toggle (Friends/Venues) While Keeping Venue Type Filter

### Implementation Complete

Added a layer visibility toggle to the map that lets users switch between:
- **Both** (default) - Shows friends + venues
- **👤 Friends** - Shows only friend avatars, hides venue pins
- **📍 Venues** - Shows only venue pins, hides friend avatars

### Changes Made

**File: `src/pages/Map.tsx`**

1. Added `layerVisibility` state (`'both' | 'friends' | 'venues'`)
2. Friend markers now skip rendering when `layerVisibility === 'venues'`
3. Venue markers now skip rendering when `layerVisibility === 'friends'`
4. Added 3-segment toggle UI below the venue type filter
5. Friends list/pill hidden in venues-only mode
6. Relationship legend hidden in venues-only mode
7. Switching modes clears the cluster popover

### Behavior

| Mode | Friend Avatars | Venue Pins | Friends Pill | Legend |
|------|----------------|------------|--------------|--------|
| Both | ✓ | ✓ | ✓ | ✓ |
| Friends | ✓ | ✗ | ✓ | ✓ |
| Venues | ✗ | ✓ | ✗ | ✗ |
