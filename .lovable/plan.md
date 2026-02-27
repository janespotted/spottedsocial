

## Plan: Update Neighborhood Filters + Seed Launch Venues

### Task 1: Update neighborhood filters
Update `src/lib/city-neighborhoods.ts` to only include launch neighborhoods:
- **LA (6):** West Hollywood, Hollywood, Downtown LA, Santa Monica, Venice, Silver Lake
- **NYC (9):** Lower East Side, East Village, West Village, SoHo, Meatpacking, Chelsea, Midtown, Williamsburg, Bushwick
- Keep Palm Beach as-is
- Default behavior ("All [city]") already works via `selectedNeighborhood = null`

### Task 2: Seed ~141 venues into the database
Insert all listed venues via SQL migration with hardcoded coordinates, neighborhood, type, city, `is_demo = true`, and interleaved `popularity_rank`.

The `venues` table already has: `name`, `lat`, `lng`, `neighborhood`, `type`, `city`, `is_demo`, `popularity_rank`, `google_place_id`. No schema changes needed.

**Approach:** Single SQL migration with `INSERT ... ON CONFLICT (name) DO UPDATE` to upsert all venues. Coordinates will be hardcoded based on known addresses. Popularity ranks will be interleaved across neighborhoods so the top 20 represent a diverse mix.

**LA ranking strategy (56 venues):** Interleave top venues from each neighborhood. Example top 10: Bootsy Bellows (WeHo) #1, The Box (LES-equivalent: Exchange LA) #2, Le Bain equivalent... I'll distribute so top 20 spans all 6 LA neighborhoods.

**NYC ranking strategy (85 venues):** Same interleaving approach across 9 neighborhoods so top 20 is a good mix.

### Files to modify
1. `src/lib/city-neighborhoods.ts` — trim to launch neighborhoods only
2. New SQL migration — INSERT all ~141 venues with coordinates, types, neighborhoods, and ranks

### Technical note
The `venues` table has a unique constraint on `name`, so the migration will use `ON CONFLICT (name) DO UPDATE` to safely upsert. All venues get `is_demo = true` as requested.

