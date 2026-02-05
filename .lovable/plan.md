

## Fix: Refresh City Detection on Private Party Check-in

### Problem
When a user checks into a private party, the city badge in the header shows the cached city (NYC) instead of detecting their actual location (LA/Santa Monica). 

The planning flow correctly calls `refreshCity()` before showing neighborhoods, but the private party flow skips this step.

### Root Cause
In `CheckInModal.tsx`:
- **Planning flow** (line 329-332): Calls `await refreshCity()` before showing neighborhood options
- **Private party flow** (line 236-258): Does NOT call `refreshCity()` - uses stale cached city value

### Solution
Add `refreshCity()` call to the private party flow, matching the planning flow pattern.

---

### File to Modify

**`src/components/CheckInModal.tsx`**

Update `handlePrivatePartyPrivacyConfirm` function:

```typescript
const handlePrivatePartyPrivacyConfirm = async () => {
  setShowPrivatePartyPrivacy(false);
  setPrivatePartyNeighborhood('');
  setShowNeighborhoodManualSelect(false);
  setShowPrivatePartyNeighborhood(true);
  
  // NEW: Refresh city detection based on current GPS before detecting neighborhood
  const detectedCity = await refreshCity();
  
  // Auto-detect neighborhood from GPS
  setIsDetectingNeighborhood(true);
  try {
    // Use the freshly detected city
    const detectedNeighborhood = await detectNeighborhoodFromGPS(detectedCity);
    if (detectedNeighborhood) {
      setPrivatePartyNeighborhood(detectedNeighborhood);
    } else {
      setShowNeighborhoodManualSelect(true);
    }
  } catch (error) {
    console.error('Failed to detect neighborhood:', error);
    setShowNeighborhoodManualSelect(true);
  } finally {
    setIsDetectingNeighborhood(false);
  }
};
```

---

### What This Fixes

| Scenario | Before | After |
|----------|--------|-------|
| User cached as NYC, physically in LA | City badge shows "NYC", neighborhoods show NYC list | City badge updates to "LA", neighborhoods show LA list |
| Private party check-in | Uses stale cached city | Fresh GPS detection, updates city badge |

---

### Impact

- Single function change in `CheckInModal.tsx`
- Matches existing pattern from planning flow
- CityBadge automatically updates via `cityChanged` event listener
- Neighborhoods dropdown shows correct city's neighborhoods

