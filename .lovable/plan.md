

## Fix: Map Pin Icons Cut Off at Top

The teardrop pin is drawn on a canvas that's too short. The circle portion of the pin extends above the canvas boundary (y = -4), so the top gets clipped.

**Root cause (line 1127-1134)**: Canvas height is `44px` but the arc center is at y=14 with radius 18, reaching y=-4 — above the canvas.

### Fix in `src/pages/Map.tsx` (lines 1124-1150)

Add vertical padding to the canvas and offset all drawing down:

1. Increase canvas height from `size + 8` to `size + 16` (52px total)
2. Add a `yOffset = 8` to shift all drawing coordinates down by 8px
3. Apply `yOffset` to the `moveTo`, `bezierCurveTo`, `arc` calls so the full teardrop fits within the canvas

This ensures the entire pin shape renders within the canvas bounds before being passed to Mapbox as an image.

**File**: `src/pages/Map.tsx` (lines 1124-1150)

