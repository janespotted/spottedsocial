

## Fix Map Promoted Venue Pulse Animation Not Working

### The Problem

Spotlight LA (the promoted venue) is in the database with `is_map_promoted: true` and coordinates in Downtown LA, but the pulsing glow animation doesn't appear on the map.

**Root Cause**: The `@keyframes pulse` animation is incorrectly placed **inside** the `@layer base { }` block in `src/index.css`. CSS `@keyframes` rules don't work properly when scoped inside Tailwind's `@layer` directives - they need to be at the global scope.

```
Current structure (broken):
@layer base {
  ...
  @keyframes pulse { ... }  <-- Line 293, inside @layer base
}  <-- Line 303 closes @layer base
```

### Solution

Move the `@keyframes pulse` animation **outside** the `@layer base` block so it's defined at global scope.

```
Fixed structure:
@layer base {
  ...
}  <-- @layer base ends

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

### Technical Details

| Aspect | Current | Fixed |
|--------|---------|-------|
| Animation location | Inside `@layer base` (line 293) | After `@layer base` closes |
| Animation scope | Layer-scoped (broken) | Global (working) |
| Browser behavior | Silently fails to apply | Animates correctly |

### Files to Modify

| File | Change |
|------|--------|
| `src/index.css` | Move `@keyframes pulse` definition outside of `@layer base` block |

### Expected Result

After the fix, Spotlight LA will display on the map with:
- Larger neon yellow/purple gradient pin (60px container)
- **Animated pulsing yellow glow** that breathes in and out
- Star badge in top-right corner
- Higher z-index (appears above other pins)

