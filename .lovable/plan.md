

## LA Venue Database Audit & Fix Location Detection

### Part 1: Detection Threshold (Answering Your Question)

The venue detection uses these thresholds (in `src/lib/venue-arrival-nudge/trigger.ts`):

| Threshold | Meters | Feet |
|-----------|--------|------|
| **Venue Trigger Radius** | 200m | ~656 feet |
| **Max Detection Distance** | 500m | ~1,640 feet |
| **GPS Accuracy Required** | ≤50m | ~164 feet |
| **Dwell Time** | 45 seconds | - |

So when you're at 523 Ocean Front Walk, the app will detect any venue within **656 feet (200m)** and prompt you. The dropdown shows venues within **1,640 feet (500m)**.

---

### Part 2: Coordinate Issue Found

**The Problem:** The current coordinates for **Venice Beach Bar & Kitchen** in the database are wrong:
- Database coords: `33.9859, -118.4712` (this is ~1km inland!)  
- Actual location: `33.9941, -118.4799` (323 Ocean Front Walk)

Since you're at **523 Ocean Front Walk**, Venice Beach Bar & Kitchen (at 323 Ocean Front Walk) should be the closest venue - just ~200 meters north of you along the boardwalk. But the wrong coordinates made the system skip it.

**Dudley Market** is at `33.9942, -118.4797` (9 Dudley Ave, slightly inland from boardwalk), which is why it detected that after we added it.

---

### Part 3: Venice Venues Audit

**Venues to UPDATE (Wrong Coordinates or Rebranded):**

| Current Name | Issue | Fix |
|--------------|-------|-----|
| Venice Beach Bar & Kitchen | Wrong coordinates (1km off) | Update to `33.9941, -118.4799` |
| Venice Ale House Bar | **Rebranded to "Venice Beach Club"** in July 2025 | Rename + update coords to `33.9930, -118.4736` |
| Kassi Rooftop | Verify coords are correct for Hotel Erwin | Update to `33.9935, -118.4800` |
| Wurstkuche Arts District | **Wrong neighborhood** - it's in Arts District DTLA, not Venice | Remove from Venice OR update to Venice location at 625 Lincoln Blvd |

**Venues to REMOVE (Not Nightlife per Quality Standards):**

| Venue | Reason |
|-------|--------|
| Butcher's Daughter Venice | Daytime cafe, closes 9-10pm, not nightlife |
| Gjelina Venice | Restaurant (no bar scene), closes 10:30pm |
| Sunny Spot Venice | Now a different restaurant "Nueva" |

**Venues Currently Good:**
- The Brig Venice
- Venice Whaler
- Hinano Cafe Venice
- Townhouse Del Monte
- The Otheroom Venice
- The Roosterfish
- James Beach Venice
- Larry's Venice Beach
- Canal Club Venice
- Scopa Italian Venice (still open as wine bar/cocktail bar)
- Dudley Market (just added)
- Waterfront Venice
- Tasting Kitchen Venice

---

### Part 4: Database Updates Required

```sql
-- Fix Venice Beach Bar & Kitchen coordinates
UPDATE venues 
SET lat = 33.9941, lng = -118.4799 
WHERE name = 'Venice Beach Bar & Kitchen';

-- Rename Venice Ale House to Venice Beach Club
UPDATE venues 
SET name = 'Venice Beach Club', 
    lat = 33.9930, 
    lng = -118.4736 
WHERE name = 'Venice Ale House Bar';

-- Fix Kassi Rooftop coordinates (Hotel Erwin)
UPDATE venues 
SET lat = 33.9935, lng = -118.4800 
WHERE name = 'Kassi Rooftop';

-- Fix Wurstkuche - update to correct Venice location
UPDATE venues 
SET lat = 33.9913, lng = -118.4628, neighborhood = 'Venice'
WHERE name = 'Wurstkuche Arts District' AND neighborhood = 'Venice';

-- Rename to just Wurstkuche Venice
UPDATE venues 
SET name = 'Wurstkuche Venice'
WHERE name = 'Wurstkuche Arts District' AND neighborhood = 'Venice';

-- Remove non-nightlife venues
DELETE FROM venues WHERE name = 'Butcher''s Daughter Venice';
DELETE FROM venues WHERE name = 'Sunny Spot Venice';
```

---

### Part 5: After Fix - Expected Behavior

When you're at **523 Ocean Front Walk**, the detection order should be:

1. **Venice Beach Bar & Kitchen** (~200m north) - Primary detection
2. **Dudley Market** (~50m inland) - In dropdown
3. **Kassi Rooftop** (~250m) - In dropdown
4. Other nearby boardwalk venues in dropdown

---

### Files Changed
- Database updates only (no code changes needed)
- Dropdown feature already exists in `VenueArrivalPrompt.tsx`

