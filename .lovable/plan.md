

## Fix Promoted Venues Not Appearing on Leaderboard

### Problem
Promoted venues (The Dresden, Covell for LA) are being filtered out of the leaderboard because the `openVenueArray` filter removes any venue that isn't currently open based on their operating hours. 

Since The Dresden opens at 5pm and Covell opens at 4pm on weekdays, they don't appear on the leaderboard until they're open.

### Root Cause
Line 333-337 in `Leaderboard.tsx`:
```typescript
const openVenueArray = venueArray.filter(v => {
  if (!v.operatingHours) return isNightlifeHours();
  return isVenueOpen(v.operatingHours);
});
```

This filter applies to **all venues including promoted ones**, which violates the business model requirement that promoted venues should **always appear** (they paid for guaranteed visibility).

### Solution
Exempt promoted venues from the "currently open" filter. Promoted venues should always appear on the leaderboard regardless of their current operating status.

---

### File Changes

**File:** `src/pages/Leaderboard.tsx`

**Current (lines 332-337):**
```typescript
// Filter out closed venues - only show open venues on leaderboard
const openVenueArray = venueArray.filter(v => {
  // If no operating hours data, only show during nightlife hours (11am-5am)
  if (!v.operatingHours) return isNightlifeHours();
  return isVenueOpen(v.operatingHours);
});
```

**Updated:**
```typescript
// Filter out closed venues - only show open venues on leaderboard
// EXCEPT promoted venues which always appear (paid placement guarantee)
const openVenueArray = venueArray.filter(v => {
  // Promoted venues always appear regardless of operating hours
  if (v.isPromoted) return true;
  // If no operating hours data, only show during nightlife hours (11am-5am)
  if (!v.operatingHours) return isNightlifeHours();
  return isVenueOpen(v.operatingHours);
});
```

---

### Expected Result
After this fix:
- **Promoted venues** (The Dresden, Covell for LA; Patent Pending, Little Sister Lounge for NYC) will **always appear** at the top of the leaderboard
- Regular venues will still be filtered by operating hours
- Promoted section separator will display when promoted venues exist

---

### Technical Details

| Scenario | Current Behavior | Fixed Behavior |
|----------|-----------------|----------------|
| Promoted venue closed | Hidden | Visible (paid guarantee) |
| Regular venue closed | Hidden | Hidden (unchanged) |
| Promoted venue open | Visible | Visible (unchanged) |
| Regular venue open | Visible | Visible (unchanged) |

