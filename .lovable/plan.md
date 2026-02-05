

## Separate Leaderboard and Map Promotions

### Current State Analysis

| Component | Current Behavior | Issue |
|-----------|-----------------|-------|
| `venues` table | Single `is_promoted` boolean | Cannot distinguish leaderboard vs map promotion |
| `venue_promotions` table | Has `promotion_type` column | Already supports separation but not used by admin |
| Admin Panel | Toggles `is_promoted` flag | Only affects leaderboard, no map promotion control |
| Business Portal | Shows both options | Placeholder only, not functional |
| Leaderboard | Filters by `is_promoted` | Works correctly |
| Map | No promotion styling | All venue pins identical |

---

### Solution Overview

Add separate promotion flags to the `venues` table and update both the admin panel and map to support them independently.

---

### Database Changes

Add new column to `venues` table:

```text
venues table:
  - is_promoted (boolean)        -> RENAME to is_leaderboard_promoted
  - is_map_promoted (boolean)    -> ADD NEW column
```

Migration approach:
1. Add `is_map_promoted` boolean column (default false)
2. Rename `is_promoted` to `is_leaderboard_promoted` for clarity
3. Update all code references from `is_promoted` to `is_leaderboard_promoted`

---

### Admin Panel Changes

Update the "Promoted" tab to show two sections:

```text
+------------------------------------------+
| Leaderboard Promotions                   |
| [NYC] [LA] [PB]                         |
|                                          |
| Trophy Icon  Currently Promoted (2)      |
| - Venue A  [X Remove]                    |
| - Venue B  [X Remove]                    |
|                                          |
| + Add to Leaderboard: [Search venues...] |
+------------------------------------------+

+------------------------------------------+
| Map Promotions                           |
| [NYC] [LA] [PB]                         |
|                                          |
| MapPin Icon  Map Highlighted (3)         |
| - Venue C  [X Remove]                    |
| - Venue D  [X Remove]                    |
| - Venue E  [X Remove]                    |
|                                          |
| + Add to Map Promoted: [Search venues...]|
+------------------------------------------+
```

---

### Map Visual Changes

Map-promoted venues will have special styling:

```text
Regular venue pin:     Purple circle with location icon
Map-promoted venue:    Glowing purple circle with pulsing animation
                       Larger size (visible from further zoom)
                       Always visible regardless of heat score
```

---

### Files to Modify

| File | Change |
|------|--------|
| Database Migration | Add `is_map_promoted` column, rename `is_promoted` to `is_leaderboard_promoted` |
| `src/pages/Admin.tsx` | Add separate sections for leaderboard and map promotions |
| `src/pages/Leaderboard.tsx` | Update references from `is_promoted` to `is_leaderboard_promoted` |
| `src/pages/Map.tsx` | Add special styling for map-promoted venues, ensure they're always visible |
| `src/pages/business/BusinessPromote.tsx` | Update to use new promotion fields |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |

---

### Technical Details

**Database Migration SQL:**
```sql
-- Add new map promotion column
ALTER TABLE venues ADD COLUMN is_map_promoted boolean DEFAULT false;

-- Rename existing column for clarity
ALTER TABLE venues RENAME COLUMN is_promoted TO is_leaderboard_promoted;

-- Create index for efficient filtering
CREATE INDEX idx_venues_map_promoted ON venues(is_map_promoted) WHERE is_map_promoted = true;
```

**Map Promoted Venue Styling (src/pages/Map.tsx):**
- Check `venue.is_map_promoted` when rendering markers
- Apply glowing animation, larger size, higher z-index
- Filter map-promoted venues separately to ensure always visible

**Admin Panel Update (src/pages/Admin.tsx):**
- Split promoted venues state into `leaderboardPromotedVenues` and `mapPromotedVenues`
- Add separate search and add/remove functionality for each type
- Use distinct icons (Trophy for leaderboard, MapPin for map)

---

### Benefits

1. Venues can be promoted on leaderboard, map, or both independently
2. Different pricing tiers in business portal make sense
3. Clearer admin controls with visual separation
4. Map gets more engaging visual feedback for promoted spots

