

## Fix: Location Timeout Error When Sharing Location

### Root Cause
`getAccurateLocation()` in `location-service.ts` uses `watchPosition` with a **3-second timeout** (`MAX_TIME_MS = 3000`). On mobile browsers indoors or with weak GPS signal, 3 seconds is far too short for a first GPS fix. The raw `GeolocationPositionError` message ("Timeout expired") bubbles up to the user as an ugly red toast.

### Fixes

| File | Change |
|---|---|
| `src/lib/location-service.ts` | Increase `getAccurateLocation` timeout from 3s to 10s; increase `watchPosition` timeout option to 15s to give the browser enough time for a cold GPS fix |
| `src/components/CheckInModal.tsx` | Add automatic retry on timeout (one retry with `getCurrentLocation` fallback before showing error); improve error message to be user-friendly instead of raw browser text |

### Details

**`location-service.ts`:**
- Change `MAX_TIME_MS` from `3000` to `10000`
- Change `watchPosition` timeout option from `MAX_TIME_MS` to `15000` (browser-level timeout should be longer than our selection timeout to let readings trickle in)

**`CheckInModal.tsx`:**
- In the `catch` block of `captureAndDeriveVenue`, detect timeout errors and auto-retry once using `getCurrentLocation()` (single-shot, 15s timeout) before giving up
- Replace raw error messages with human-friendly descriptions: "Getting your location took a bit longer than expected. Try moving to an open area or check that GPS is enabled."

