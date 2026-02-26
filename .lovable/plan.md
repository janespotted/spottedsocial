

# Restore "Spotted" Title Above Leaderboard

## Problem
The Home page header has a "Spotted" text line above the page title (line 276: `<h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>` with `CityBadge` next to it), but the Leaderboard page is missing this — it only has "Leaderboard" with the CityBadge directly.

## Fix

### `src/pages/Leaderboard.tsx` — lines 454-457

Replace the current title block:
```tsx
<div className="flex items-center gap-2">
  <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
  <CityBadge />
</div>
```

With the same pattern as Home — "Spotted" + CityBadge on top, then the page title below:
```tsx
<div className="flex items-center gap-3 mb-1">
  <h1 className="text-2xl font-light tracking-[0.3em] text-white">Spotted</h1>
  <CityBadge />
</div>
<h2 className="text-3xl font-bold text-white">Leaderboard</h2>
```

This restores the consistent header hierarchy: Spotted logo text + CityBadge on the first line, page title on the second.

