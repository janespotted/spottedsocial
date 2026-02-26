

# Add CityBadge to Leaderboard Header + Reduce Title Size

## Current State
The Leaderboard header (line 454) shows "Leaderboard" at `text-3xl font-bold` with no CityBadge. All other pages (Home, Map, Messages, Profile) include the CityBadge next to the title.

## Changes

### `src/pages/Leaderboard.tsx`

**1. Add CityBadge next to the title (line 453-454)**

Wrap the title in a flex row and append the CityBadge:

```tsx
<div className="flex items-center gap-2">
  <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
  <CityBadge />
</div>
```

- Title reduced from `text-3xl` to `text-2xl` to fit the badge comfortably
- `mb-1` removed from h2 since the flex container handles spacing

**2. Verify CityBadge import exists** — it's already imported in other pages; confirm it's imported here (or add the import).

