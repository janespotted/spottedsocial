

## Speed Up Location Detection

The slowness is because `getAccurateLocation()` keeps sampling GPS for up to **10 seconds** waiting for a reading under 100m accuracy — but we already accept 150m for check-ins. So it always burns the full 10s timer when indoors.

### Fix

| File | Change |
|---|---|
| `src/lib/location-service.ts` | Raise `TARGET_ACCURACY` from `100` to `150` to match `GPS_ACCURACY_THRESHOLD_CHECKIN` — the first reading under 150m will resolve immediately instead of waiting the full 10s |

One line change. No reliability impact — we already accept 150m readings, so there's no reason to keep sampling for better accuracy we don't need.

