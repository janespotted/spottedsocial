

# Improve Location Detection Accuracy

## Problem

When you said you were at 523 Ocean Front Walk, the app incorrectly detected Kassi Rooftop as the nearest venue instead of Dudley Market. 

**Root cause**: Your device reported GPS coordinates ~176 meters off from your actual position. Even though the device reported "good accuracy" (under 50m uncertainty), the coordinates themselves were inaccurate.

**Result**:
- From captured GPS: Kassi = 148m, Dudley = 182m (Kassi detected)
- From actual location: Dudley = 11m, Kassi = 72m (Dudley should be detected)

---

## Solution: Multi-Sample GPS with Best-of-Three Selection

Replace the single-shot `getCurrentPosition()` with a `watchPosition()` approach that:
1. Collects multiple GPS readings over 3-5 seconds
2. Keeps only readings with accuracy ≤30m (stricter than current 50m threshold)
3. Selects the reading with the best accuracy
4. Falls back gracefully if no high-accuracy reading arrives

---

## Technical Changes

### File: `src/lib/location-service.ts`

**New function: `getAccurateLocation()`**

```typescript
/**
 * Get accurate GPS by sampling multiple readings via watchPosition
 * Collects readings for up to 5 seconds, returning the most accurate one
 */
export const getAccurateLocation = (): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}> => {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    const readings: Array<{
      lat: number;
      lng: number;
      accuracy: number;
      timestamp: number;
    }> = [];
    
    const MAX_TIME_MS = 5000;      // Max 5 seconds
    const TARGET_ACCURACY = 30;    // Target 30m accuracy
    const MIN_READINGS = 2;        // Minimum readings before early exit
    
    let watchId: number;
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const cleanup = () => {
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timeoutId);
    };
    
    const selectBestReading = () => {
      if (readings.length === 0) {
        reject(new Error('No GPS readings received'));
        return;
      }
      // Return reading with lowest accuracy value (most precise)
      const best = readings.reduce((a, b) => 
        a.accuracy < b.accuracy ? a : b
      );
      resolve(best);
    };
    
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const reading = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        readings.push(reading);
        
        // Early exit if we get a very accurate reading
        if (reading.accuracy <= TARGET_ACCURACY && readings.length >= MIN_READINGS) {
          cleanup();
          selectBestReading();
        }
      },
      (error) => {
        cleanup();
        if (readings.length > 0) {
          selectBestReading();
        } else {
          reject(error);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: MAX_TIME_MS,
        maximumAge: 0,
      }
    );
    
    // Timeout: resolve with best reading after max time
    timeoutId = setTimeout(() => {
      cleanup();
      selectBestReading();
    }, MAX_TIME_MS);
  });
};
```

### File: `src/hooks/useVenueArrivalNudge.ts`

**Line 6**: Import the new function

```typescript
import { 
  getCurrentLocation, 
  getAccurateLocation,  // Add this
  findNearestVenue, 
  findNearbyVenues, 
  calculateDistance 
} from '@/lib/location-service';
```

**Line 132**: Use `getAccurateLocation` instead of `getCurrentLocation`

```typescript
// Before:
const location = await getCurrentLocation();

// After:
const location = await getAccurateLocation();
```

### File: `src/lib/venue-arrival-nudge/trigger.ts`

**Line 12**: Tighten accuracy threshold from 50m to 35m

```typescript
// Before:
const GPS_ACCURACY_THRESHOLD = 50;

// After:
const GPS_ACCURACY_THRESHOLD = 35;
```

---

## How It Works

```text
Current Flow:
┌─────────────────┐
│ Single GPS read │ ──> May be inaccurate
└─────────────────┘

New Flow:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ GPS read #1     │ ──> │ GPS read #2     │ ──> │ GPS read #3     │
│ accuracy: 45m   │     │ accuracy: 28m   │     │ accuracy: 22m   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │ Select best     │
                                              │ (22m accuracy)  │
                                              └─────────────────┘
```

---

## Expected Improvements

| Metric | Before | After |
|--------|--------|-------|
| GPS readings collected | 1 | 2-5 |
| Accuracy threshold | 50m | 35m |
| Time to get location | ~1s | 2-5s |
| False venue detection | Possible | Reduced |

The trade-off is slightly longer location acquisition time (up to 5 seconds max) in exchange for significantly better accuracy.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/lib/location-service.ts` | Add `getAccurateLocation()` function using watchPosition |
| `src/hooks/useVenueArrivalNudge.ts` | Use `getAccurateLocation` instead of `getCurrentLocation` |
| `src/lib/venue-arrival-nudge/trigger.ts` | Reduce accuracy threshold from 50m to 35m |

