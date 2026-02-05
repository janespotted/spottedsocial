
## Fix Map Promoted Venue Display + Clarify Leaderboard Limit

### Issues Found

| Issue | Root Cause | Status |
|-------|-----------|--------|
| **Spotlight LA not showing special on map** | The venue **does** have `is_map_promoted: true` in the database. However, the map doesn't auto-refresh when promotions change in Admin. | **Needs fresh page load** |
| **Only 2 promoted spots on leaderboard (not 8)** | This is **intentional**. Line 333 in Leaderboard.tsx: `const topPromotedVenues = allPromotedVenues.slice(0, 2)` explicitly limits to 2 spots. | **By design** |

---

### Issue 1: Map Not Showing Promoted Styling

**Verified Data:**
- Database confirms `Spotlight LA` has `is_map_promoted: true` ✓
- Map fetch logic correctly reads `venue.is_map_promoted || false` ✓
- Marker styling correctly applies glow + star when `isMapPromoted = true` ✓

**Problem:**
The map fetches venue data once when the page loads. When you add a venue to "Map Promoted" in Admin:
1. Database is updated immediately
2. BUT the map page (in a different tab/browser) doesn't re-fetch venues
3. User sees old styling until they refresh the page

**Solution Options:**

| Option | Effort | User Experience |
|--------|--------|-----------------|
| A. Manual refresh required | None | User must refresh to see changes |
| B. Add realtime subscription for venue promotions | Medium | Auto-update when promotions change |
| C. Add pull-to-refresh on map | Low | User can swipe down to refresh |

**Recommended: Option B** - Add realtime subscription for venue updates, specifically listening for `is_map_promoted` changes.

---

### Issue 2: Leaderboard Shows Only 2 Promoted Spots

**Current Behavior (Intentional):**
```typescript
// Line 333-334 in Leaderboard.tsx
// Get top 2 promoted venues only
const topPromotedVenues = allPromotedVenues.slice(0, 2);
```

The leaderboard is designed to show **exactly 2 promoted spots** to:
- Keep the promoted section focused
- Prevent promoted venues from dominating the view
- Create scarcity for the paid placement product

**Your Options:**

| Change | Impact |
|--------|--------|
| Keep at 2 | Original design - 2 premium spots |
| Increase to 4 | Show 4 promoted spots |
| Show all | All 6+ promoted venues visible in LA |

---

### Recommended Plan

1. **For Map Promotion Visibility:**
   - Add realtime subscription to detect when `venues` table changes
   - Re-fetch venues when `is_map_promoted` is updated
   - Existing marker diffing logic will auto-recreate promoted markers with correct styling

2. **For Leaderboard Limit:**
   - Clarify: Do you want to increase the promoted spots limit from 2 to something higher?

---

### Code Changes for Map Realtime Fix

**File: `src/pages/Map.tsx`**

Add subscription for venue promotion changes in the existing realtime channel:

```text
Current realtime subscriptions:
- profiles table (friend locations)
- night_statuses table (check-ins)
- checkins table

Add:
- venues table (specifically for is_map_promoted changes)
```

This will trigger `debouncedFetchFriendsLocations()` which calls `fetchVenuesWithHeatScores()`, fetching fresh venue data including promotion status.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/Map.tsx` | Add venues table to realtime subscription for promotion updates |
| `src/pages/Leaderboard.tsx` | *Optional*: Change `slice(0, 2)` to show more promoted spots if desired |

---

### Testing After Fix

1. Open Map page in one tab
2. Open Admin in another tab
3. Add a venue to Map Promoted
4. Map should auto-update within a few seconds with the special promoted styling (glow + star)
