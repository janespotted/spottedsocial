

## LA & NYC Venue Database Audit - Complete Cleanup

### Summary
A thorough audit of all venues in both LA and NYC to remove closed venues, fix incorrect data, and ensure the database reflects accurate, current nightlife locations.

---

## Part 1: LA Venues Audit

### Venues to DELETE (Closed Permanently)

| Venue | Reason |
|-------|--------|
| Standard Downtown Rooftop | **CLOSED** - The Standard Downtown LA hotel closed permanently in 2022 |
| The Edison DTLA | **TEMPORARILY CLOSED** - Currently listed as "temporarily closed" on Yelp for over 1 month, uncertain future |
| The Varnish | **CLOSED** - Legendary cocktail bar closed July 2024 after 15 years |
| Cole's French Dip | **CLOSING** - 118-year-old bar announced permanent closure January 2026 |

### Venues to UPDATE (Name/Coordinate Fixes)

| Current Name | Fix |
|--------------|-----|
| Clifton's Cafeteria | Rename to **Clifton's Republic** (reopened Nov 2024 after renovation) |
| Escondite DTLA | Remove duplicate - keep **The Escondite** only (same venue listed twice) |
| Academy LA | Update neighborhood from "Downtown LA" to **Hollywood** (venue is on Vine St in Hollywood) |

### Venice Beach Specific Fixes (from previous plan)
These should already be done but verify:
- Dudley Market added at correct coords
- High Rooftop Lounge removed (duplicate of Kassi Rooftop)
- Kassi Rooftop has correct Hotel Erwin coordinates

---

## Part 2: NYC Venues Audit

### Venues to DELETE (Closed Permanently)

| Venue | Neighborhood | Reason |
|-------|--------------|--------|
| Gilded Lily Chelsea | Chelsea | **CLOSED 2018** - Became Red Rabbit Club, then closed |
| Highline Ballroom | Meatpacking | **CLOSED 2019** - Lease not renewed, venue shut down |
| Brooklyn Bazaar GP | Greenpoint | **CLOSED** - No longer operating as event venue |
| Lucky Cheng's EV | East Village | **CLOSED 2014** - Iconic drag bar closed, building sold |
| John Dory Oyster neighborhood | Flatiron | **CLOSED 2019** - Ace Hotel restaurant closed |
| The Breslin NYC | Flatiron | **CLOSED** - Restaurant at Ace Hotel shuttered |

### Duplicate Venues to Clean Up (Keep One)

| Duplicate | Keep | Delete |
|-----------|------|--------|
| Dead Rabbit FiDi + The Dead Rabbit | Keep **The Dead Rabbit** | Delete Dead Rabbit FiDi (same bar) |
| Attaboy + Attaboy LES | Keep **Attaboy** | Delete Attaboy LES (same bar) |
| Le Bain + Le Bain NYC | Keep **Le Bain** | Delete Le Bain NYC (same bar) |

### Venues Verified as Still Open
The following high-profile venues were verified as still operating:
- House of Yes (Bushwick) - Active, hosting events
- Good Room (Greenpoint) - Active, won DJ Mag award
- Marquee NYC (Chelsea) - Reopened after renovation fall 2025
- Elsewhere (Bushwick) - Active
- Up and Down (Meatpacking) - Active
- Pattern Bar (DTLA) - Active
- Dirty Laundry (Hollywood) - Active
- Formosa Cafe (Hollywood) - Active
- Academy LA (Hollywood) - Active
- Cha Cha Lounge (Silver Lake) - Active
- The Escondite (DTLA) - Active

---

## Part 3: Database SQL Commands

```sql
-- =====================
-- LA VENUE DELETIONS
-- =====================

-- Standard Downtown Rooftop - permanently closed 2022
DELETE FROM venues WHERE name = 'Standard Downtown Rooftop' AND city = 'la';

-- Cole's French Dip - closing permanently Jan 2026
DELETE FROM venues WHERE name = 'Cole''s French Dip' AND city = 'la';

-- The Varnish - closed July 2024
DELETE FROM venues WHERE name = 'The Varnish' AND city = 'la';

-- =====================
-- LA VENUE UPDATES
-- =====================

-- Rename Clifton's Cafeteria to Clifton's Republic
UPDATE venues SET name = 'Clifton''s Republic' WHERE name = 'Clifton''s Cafeteria' AND city = 'la';

-- Fix Academy LA neighborhood (it's in Hollywood, not DTLA)
UPDATE venues SET neighborhood = 'Hollywood', lat = 34.1018, lng = -118.3267 WHERE name = 'Academy LA' AND city = 'la';

-- Remove duplicate Escondite DTLA (keep The Escondite)
DELETE FROM venues WHERE name = 'Escondite DTLA' AND city = 'la';

-- =====================
-- NYC VENUE DELETIONS
-- =====================

-- Gilded Lily - closed 2018
DELETE FROM venues WHERE name = 'Gilded Lily Chelsea' AND city = 'nyc';

-- Highline Ballroom - closed 2019
DELETE FROM venues WHERE name = 'Highline Ballroom' AND city = 'nyc';

-- Brooklyn Bazaar - no longer nightlife venue
DELETE FROM venues WHERE name = 'Brooklyn Bazaar GP' AND city = 'nyc';

-- Lucky Cheng's - closed 2014
DELETE FROM venues WHERE name = 'Lucky Cheng''s EV' AND city = 'nyc';

-- John Dory Oyster Bar - closed 2019
DELETE FROM venues WHERE name = 'John Dory Oyster' AND city = 'nyc';

-- The Breslin - closed
DELETE FROM venues WHERE name = 'The Breslin NYC' AND city = 'nyc';

-- =====================
-- NYC DUPLICATE CLEANUP
-- =====================

-- Remove Dead Rabbit duplicate
DELETE FROM venues WHERE name = 'Dead Rabbit FiDi' AND city = 'nyc';

-- Remove Attaboy duplicate
DELETE FROM venues WHERE name = 'Attaboy LES' AND city = 'nyc';

-- Remove Le Bain duplicate
DELETE FROM venues WHERE name = 'Le Bain NYC' AND city = 'nyc';
```

---

## Part 4: Detection Thresholds (Reference)

As a reminder, here are the venue detection thresholds in the app:

| Threshold | Value |
|-----------|-------|
| Trigger Radius | 200m (~656 feet) |
| Max Detection Distance | 500m (~1,640 feet) |
| GPS Accuracy Required | ≤50m (~164 feet) |
| Dwell Time | 45 seconds |

---

## Part 5: Post-Cleanup Summary

**LA Venues:**
- Removing: 3-4 venues (Standard Rooftop, Cole's, The Varnish, duplicate Escondite)
- Updating: 2 venues (Clifton's rename, Academy LA location fix)

**NYC Venues:**
- Removing: 9 venues (6 closed + 3 duplicates)
- No updates needed

---

## Files Changed
- Database updates only (no code changes needed)
- Existing venue dropdown functionality in `VenueArrivalPrompt.tsx` works correctly

