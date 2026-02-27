

## Fix: GPS Accuracy Rejection Blocking Check-In

### Problem
The user gets a GPS reading at 105m accuracy, but `captureLocationWithVenue()` rejects anything over 50m (`GPS_ACCURACY_THRESHOLD_CHECKIN = 50`). Indoors / urban environments routinely produce 80-150m accuracy. The user literally cannot check in.

### Fix

| File | Change |
|---|---|
| `src/lib/location-service.ts` | Raise `GPS_ACCURACY_THRESHOLD_CHECKIN` from `50` to `150` — indoor/urban GPS rarely does better than 100m |
| `src/components/CheckInModal.tsx` | Also handle the "accuracy too low" error with a retry: on first failure, wait 2s and retry once with `getAccurateLocation()` (a second GPS sampling often improves). If still too low, proceed anyway but let the user pick their venue manually instead of blocking entirely |

### Details

**`location-service.ts`:**
- Change `GPS_ACCURACY_THRESHOLD_CHECKIN` from `50` to `150`

**`CheckInModal.tsx`:**
- Expand the retry logic to also catch accuracy errors (detect via `error.message.includes('accuracy too low')`)
- On accuracy failure retry: call `getAccurateLocation()` again, then `captureLocationWithVenue(200)` with a relaxed threshold
- If retry also fails on accuracy: instead of showing an error toast, proceed to the venue confirmation screen with `isEditingVenue = true` so the user can manually type their venue — don't block the check-in entirely

