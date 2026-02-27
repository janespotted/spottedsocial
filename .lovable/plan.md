

## Problem

Now that demo mode uses real GPS instead of hardcoded venues, the 50m accuracy gate in `captureLocationWithVenue()` is rejecting your reading (105m). Previously demo mode bypassed GPS entirely so this never triggered.

Indoor/urban environments routinely produce 80-150m accuracy readings, making the 50m threshold too strict for normal use.

## Fix: Relax accuracy threshold for demo mode check-ins

**`src/lib/location-service.ts`**

- Add a new exported constant: `GPS_ACCURACY_THRESHOLD_DEMO = 200` (meters)
- Add an optional `accuracyThreshold` parameter to `captureLocationWithVenue()` that defaults to the existing 50m
- Use this parameter instead of the hardcoded `GPS_ACCURACY_THRESHOLD_CHECKIN`

**`src/components/CheckInModal.tsx`**

- When `demoMode.enabled`, call `captureLocationWithVenue(200)` (relaxed threshold)
- When not in demo mode, call `captureLocationWithVenue()` (keeps strict 50m default)

This way demo users can check in with lower-quality GPS while real check-ins keep the tighter gate.

