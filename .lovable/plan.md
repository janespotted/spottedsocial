

## Speed up GPS detection

The `getAccurateLocation()` function always waits the full 5s timeout because indoor readings rarely hit the 30m target. Three constant tweaks fix this:

**`src/lib/location-service.ts`** — in `getAccurateLocation()`:

| Constant | Current | New | Why |
|---|---|---|---|
| `MAX_TIME_MS` | 5000 | 3000 | Cap worst-case wait |
| `TARGET_ACCURACY` | 30 | 100 | Indoor readings are 80-150m; accept first usable one instantly |
| `MIN_READINGS` | 2 | 1 | Don't wait for a second sample if the first is good enough |

This means: if the first GPS reading is ≤100m, return immediately (<1s). Otherwise wait up to 3s max instead of 5s.

**Expected improvement:** ~7s → ~1-3s for the "Detecting location..." phase.

