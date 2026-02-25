

# Fix Private Party Neighborhood + Private Party Yap

## Fix 1: Private Party Neighborhood Detection

### Problem
When a user uses "Somewhere else" and types a custom location name in either `CheckInModal.tsx` or `UpdateSpotSheet.tsx`, no neighborhood detection occurs. The `updatePrivatePartyStatus` function in `CheckInModal.tsx` already does neighborhood detection for the dedicated "Private Party" button, but that flow isn't triggered for custom locations entered via "Somewhere else."

Additionally, the `handleCustomVenue` in `UpdateSpotSheet.tsx` doesn't set `is_private_party` or `party_neighborhood` at all.

### Changes

**`src/components/CheckInModal.tsx`** — `handleVenueConfirm` (lines ~451-528)
- After `handleVenueConfirm` creates a check-in with a custom venue name (no `finalVenueId` from the venues table), detect neighborhood from GPS using `detectNeighborhoodFromGPS`
- Store the detected neighborhood in `night_statuses.party_neighborhood` when the venue is a custom/non-DB venue
- The confirmation card already shows `venueName` — update to include detected neighborhood in parentheses: `"Custom Name (Silver Lake)"`

**`src/components/UpdateSpotSheet.tsx`** — `handleCustomVenue` (lines 173-222)
- After creating the check-in with a custom name, call `detectNeighborhoodFromGPS` to get the neighborhood
- Update the `night_statuses` row to include `party_neighborhood` and set `is_private_party: true` (since custom locations are effectively private parties)
- Import `detectNeighborhoodFromGPS` from location-service and `getCachedCity` from city-detection

**`src/pages/Profile.tsx`** — Display logic (line ~416)
- Already handles `partyNeighborhood` display correctly: `"Out · Private Party (Silver Lake)"`
- Ensure that custom venue names also display neighborhood: check if `is_private_party` is true and show neighborhood, or if venue name exists with party_neighborhood, show `"Out · Custom Name (Neighborhood)"`

### Technical Detail
`detectNeighborhoodFromGPS` calls `getCurrentLocation()` internally, which means it captures fresh GPS. Since we already have GPS coords from the check-in flow (`locationData` or `userLocation`), we should avoid a redundant GPS call. Instead, use the already-captured coords to call `find_nearest_venue` RPC directly and extract the neighborhood from the result — same logic as `detectNeighborhoodFromGPS` but without the extra GPS call.

---

## Fix 2: Private Party Yap Boards

### Database Changes

**Migration: Add `is_private_party` column to `yap_messages`**
```sql
ALTER TABLE yap_messages ADD COLUMN is_private_party boolean DEFAULT false;
ALTER TABLE yap_messages ADD COLUMN party_lat double precision;
ALTER TABLE yap_messages ADD COLUMN party_lng double precision;
```
- `is_private_party` marks yap messages that belong to private party boards
- `party_lat`/`party_lng` store the party location so proximity can be checked

**RLS update on `yap_messages`**: Add a policy restricting SELECT on private party yaps to users whose `night_statuses` location is within ~200m of the party coordinates:
```sql
-- Update existing SELECT policy to exclude private party yaps from general view
-- Private party yaps only visible to users at same location
CREATE POLICY "Private party yaps visible to nearby users"
  ON yap_messages FOR SELECT
  USING (
    is_private_party = false 
    OR (
      auth.uid() IS NOT NULL 
      AND EXISTS (
        SELECT 1 FROM night_statuses ns
        WHERE ns.user_id = auth.uid()
          AND ns.status = 'out'
          AND ns.lat IS NOT NULL AND ns.lng IS NOT NULL
          AND party_lat IS NOT NULL AND party_lng IS NOT NULL
          AND (
            6371000 * acos(
              cos(radians(ns.lat)) * cos(radians(party_lat)) *
              cos(radians(party_lng) - radians(ns.lng)) +
              sin(radians(ns.lat)) * sin(radians(party_lat))
            )
          ) <= 200
      )
    )
  );
```

### Frontend Changes

**`src/components/CheckInConfirmation.tsx`** — After private party check-in confirmation (yap_prompt phase)
- Currently the yap_prompt only shows when `checkInVenueId` exists (line 162: `phase === 'yap_prompt' && isOut && checkInVenueId`)
- For private parties, `checkInVenueId` is empty string `''`, so the yap prompt never appears
- Change condition to also show when it's a private party (detect by checking if venue name contains "Private Party" or add a new context flag `isPrivateParty`)
- The "Yap about it" button navigates to `/messages` with `activeTab: 'yap'` and the party venue name

**`src/contexts/CheckInContext.tsx`** — Add `checkInIsPrivateParty` state
- New boolean in context to track if current check-in is a private party
- Set when `showOutConfirmation` is called from private party flow
- Used by CheckInConfirmation to show yap prompt for private parties

**`src/components/messages/YapTab.tsx`** — Filter private party yaps from directory
- In `fetchDirectory`, add `.eq('is_private_party', false)` to the yap_messages query so private party yaps never appear in "Hottest Right Now" or "Active Tonight"
- For the "You're At" card: if user is at a private party, still show the card and allow posting — but the thread opens a private party yap thread

**`src/components/messages/VenueYapThread.tsx`** — Private party yap posting
- When posting a yap for a private party venue, set `is_private_party: true` and include `party_lat`/`party_lng` from the user's night_status
- The thread itself works the same way (anonymous posts, votes, comments) — the privacy is enforced by RLS

### What Stays the Same
- Map behavior: private party users show to friends based on privacy tier (already works)
- Public venue Yap: no changes
- 5am expiry: unchanged
- The "Somewhere else" input flow: unchanged (just adding neighborhood detection after)

### Files Summary

| File | Change |
|------|--------|
| `src/components/CheckInModal.tsx` | Add neighborhood detection for custom venues in `handleVenueConfirm` |
| `src/components/UpdateSpotSheet.tsx` | Add neighborhood detection + `is_private_party` flag in `handleCustomVenue` |
| `src/contexts/CheckInContext.tsx` | Add `checkInIsPrivateParty` boolean to context |
| `src/components/CheckInConfirmation.tsx` | Show yap prompt for private parties too |
| `src/components/messages/YapTab.tsx` | Filter `is_private_party=false` in directory queries |
| `src/components/messages/VenueYapThread.tsx` | Set `is_private_party`, `party_lat`, `party_lng` when posting private party yaps |
| Database migration | Add `is_private_party`, `party_lat`, `party_lng` columns + RLS policy on `yap_messages` |

