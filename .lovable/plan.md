

# Fix: City Detection + Private Party Neighborhood Flow

## Root Cause Analysis

Two related bugs, one root cause: **stale city cache**.

### Bug 1: Map shows NYC when user is in LA
The `useUserCity` hook initializes from `localStorage` cache (`detected_city`). If the user was previously in NYC, the cache says `nyc` and the hook never re-detects because `detectUserCity()` returns early when a cache exists. The map initializes centered on NYC because `city === 'nyc'` at render time.

The city cache has **no TTL** — once set, it persists forever. A user who travels from NYC to LA will always see the NYC map until they manually clear the cache (which no user would know to do).

### Bug 2: Private party said NYC, didn't properly ask neighborhood  
The private party flow calls `refreshCity()` which *does* force GPS re-detection. However:
- The `refreshCity()` call updates state asynchronously, but the map was already initialized with the wrong city
- The neighborhood detection via `detectNeighborhoodFromGPS` uses `find_nearest_venue` RPC with a 50km radius and **no city filter** on the `venues` table — but this is actually fine geographically since LA venues are 2,500 miles from NYC
- The real problem: the map already showed NYC, and the `CITY_NEIGHBORHOODS[city]` dropdown used the stale `city` value for the neighborhood list, potentially showing NYC neighborhoods instead of LA ones

## Fix Plan

### 1. Add TTL to city cache (`src/lib/city-detection.ts`)
- Store `{ city, timestamp }` instead of just the city string in localStorage
- Add a `CITY_CACHE_TTL` of 4 hours (14,400,000ms)
- In `getCachedCity()`, check if the cached value is within TTL. If expired, return `null` so GPS re-detection triggers
- Update `cacheCity()` to store the timestamp alongside the city

### 2. Force GPS city detection on app open (`src/hooks/useUserCity.ts`)
- On mount, even if a cache exists, always trigger a background GPS re-detection after a short delay (2 seconds)
- If the GPS-detected city differs from the cached city, update both the state and cache, which will trigger the map's `city` dependency to re-center
- This ensures the map corrects itself within seconds of opening, even if the initial render used a stale cache

### 3. Re-center map when city changes (already works)
The map already has a `useEffect([city])` that calls `flyTo` when the city changes (line 626-635). Once the hook updates the city from background GPS, the map will automatically re-center to LA.

### 4. Ensure private party flow uses fresh city for neighborhoods
In `handlePrivatePartyPrivacyConfirm` (CheckInModal.tsx line 272), `refreshCity()` already returns the detected city and passes it to `detectNeighborhoodFromGPS(detectedCity)`. This part is correct. The neighborhood dropdown at line 1159 uses `CITY_NEIGHBORHOODS[city]` where `city` comes from `useUserCity()` — once the TTL fix ensures the hook re-detects, this will show the correct neighborhoods.

## Files Modified

| File | Change |
|------|--------|
| `src/lib/city-detection.ts` | Add TTL (4 hours) to city cache: store `{city, timestamp}`, expire stale entries |
| `src/hooks/useUserCity.ts` | Add background GPS re-validation on mount even when cache exists |

## What Stays Untouched
- Map initialization and flyTo logic (already handles city changes reactively)
- Private party flow (already calls `refreshCity()` correctly)
- Venue detection RPCs (geographically correct, don't need city filter)
- All other city-related logic

