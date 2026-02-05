

## Fix Map Promoted Venue Styling

### The Problem

"Spotlight LA" is marked as `is_map_promoted = true` in the database, but it doesn't visually stand out on the map because:

**The pulsing glow animation is broken** - The marker HTML references `animation: pulse 1.5s infinite` but there's no `@keyframes pulse` defined anywhere in the CSS.

### Current Styling (What Should Happen)

The promoted marker styling code in `Map.tsx` includes these special effects:

| Feature | Promoted Venue | Regular Venue |
|---------|---------------|---------------|
| Size | 60px container, 46px pin | 50px container, 38px pin |
| Background | Gradient (purple → neon yellow) | Solid purple |
| Border | 2px neon yellow | 1.5px white |
| Glow | 12px neon yellow shadow | 3px purple shadow |
| Star badge | Yes (top-right corner) | No |
| Pulsing aura | **BROKEN** (animation: pulse doesn't exist) | N/A |
| Z-index | 8 (above others) | 5 |

### Root Cause

Line 839 in `Map.tsx`:
```javascript
animation: pulse ${isMapPromoted ? '1.5s' : '2s'} infinite;
```

But `@keyframes pulse` is never defined in the CSS. The animation silently fails.

---

### Solution

Add the missing `@keyframes pulse` animation to `src/index.css`:

```css
/* Map venue promoted pulse animation */
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.15);
    opacity: 1;
  }
}
```

This will create a breathing/pulsing effect that makes the neon yellow glow around promoted venues animate smoothly.

---

### Additional Enhancement (Optional)

To make promoted venues even more distinctive, I could also:

1. **Make the glow more intense** - Increase the box-shadow spread
2. **Add a subtle bounce** - Make the star badge animate
3. **Increase the gradient contrast** - More vibrant colors

---

### Files to Modify

| File | Change |
|------|--------|
| `src/index.css` | Add `@keyframes pulse` animation for map markers |

---

### Expected Result After Fix

Spotlight LA (and any other map-promoted venue) will show:
- Larger neon yellow/purple gradient pin
- Animated pulsing yellow glow that breathes in and out
- Star badge in top-right corner
- Higher z-index (appears above other pins)

