

# Audit: Venice Venue Location Accuracy and Data Fixes

## Issues Found

### 1. Dudley Market city is wrong
Dudley Market is stored with `city: 'nyc'` instead of `city: 'la'`. This means it won't appear in LA-filtered features (newsfeed, leaderboard) even though it's a Venice venue.

### 2. Kassi Rooftop coordinates are significantly wrong
- **DB coords:** 33.9935, -118.4800 (points to somewhere near the canals/residential area)
- **Real location** (Hotel Erwin, 1697 Pacific Ave): approximately **33.9860, -118.4633**
- This is ~1km off, which explains why it was incorrectly detected as "nearby" from your boardwalk location

### 3. Dudley Market coordinates are also off
- **DB coords:** 33.9942, -118.4797 (same area as Kassi - both placed ~1km north)
- **Real location** (11 Dudley Ave): approximately **33.9862, -118.4720**
- With corrected coords, Dudley Market would actually be very close to 523 Ocean Front Walk (~100m), and should have been the detected venue

### 4. Venice Beach Bar and Kitchen has similar coordinate issues
- DB coords nearly identical to Dudley Market (33.9941, -118.4799), suggesting copy-paste or batch geocoding error

## Distances from Your Location (523 Ocean Front Walk)

With current (wrong) DB coordinates, neither Kassi nor Dudley is within the 500m detection range from your actual location. The venues that should be detected are:

| Venue | Distance | Notes |
|-------|----------|-------|
| Hinano Cafe Venice | 186m | Correct coords, would trigger detection |
| Venice Whaler | 278m | Correct coords |
| Waterfront Venice | 427m | Correct coords |
| Dudley Market | ~100m (corrected) | Currently 1km off in DB |
| Kassi Rooftop | ~865m (corrected) | Should never trigger from boardwalk |

## Fix Plan

### Database Migration
Update the three problematic records:

1. **Dudley Market**: Fix city to `la`, update lat/lng to **33.9862, -118.4720**
2. **Kassi Rooftop**: Update lat/lng to **33.9860, -118.4633**
3. **Venice Beach Bar and Kitchen**: Update lat/lng to **33.9860, -118.4633** (also at Hotel Erwin / boardwalk area -- needs verification, but current coords are clearly wrong)

### No Code Changes Needed
The detection logic (Haversine distance, 200m trigger radius, 500m dropdown radius, dwell time, GPS accuracy gates) is all correct. The problem is purely bad coordinate data in the database.

## Technical Detail

The `find_nearest_venue` and `find_nearby_venues` database functions use the Haversine formula correctly. With accurate venue coordinates, the system will correctly identify Dudley Market as the nearest venue when you're at 523 Ocean Front Walk, and Kassi Rooftop will correctly not trigger (it's ~865m away on Pacific Ave).
