

## Fix: Use reverse geocoding for private party neighborhood detection

**Problem**: `detectNeighborhoodFromGPS()` returns the neighborhood of the nearest *venue in the database*, not the user's actual neighborhood. A user in Culver City gets labeled as "Venice" because that's the nearest venue's neighborhood.

**Solution**: Use a reverse geocoding API (Mapbox, which is already installed) to detect the actual neighborhood/locality from GPS coordinates, falling back to the current venue-based approach if geocoding fails.

### Changes

#### 1. Update `detectNeighborhoodFromGPS()` in `src/lib/location-service.ts`

- Get current GPS coordinates
- Call Mapbox reverse geocoding API: `https://api.mapbox.com/geocoding/v5/mapbox.places/{lng},{lat}.json?types=neighborhood,locality,place&access_token={token}`
- Extract the neighborhood or locality name from the response (prefer `neighborhood` type, fall back to `locality`, then `place`)
- If Mapbox fails or returns nothing, fall back to the existing venue-based detection
- The Mapbox token is already available (used in Map.tsx) — need to check how it's accessed

#### 2. Verify Mapbox token availability

Check how the Mapbox token is currently used in the project to reuse the same access pattern.

### Technical detail

Mapbox reverse geocoding response returns `features[]` with `place_type` arrays. We pick the first feature whose `place_type` includes `"neighborhood"`, or fall back to `"locality"` or `"place"` (which would return "Culver City" for that area). The `text` field gives the human-readable name.

```text
GPS coords → Mapbox reverse geocode → "Culver City"
         ↘ (fallback) → nearest venue neighborhood
```

