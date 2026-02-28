

## Fix: Private party yaps invisible due to null coordinates

### Root Cause
Two issues combine to make private party yaps invisible:

1. **Check-in stores null coordinates**: The manual private party check-in flow (`updatePrivatePartyStatus` in `CheckInModal.tsx` line 365-366) sets `lat: null, lng: null` in `night_statuses`.

2. **Yap posting copies null coords**: `VenueYapThread.tsx` reads `nightStatus.lat` and `nightStatus.lng` (both null) and stores them as `party_lat`/`party_lng` in the yap.

3. **RLS blocks visibility**: The `yap_messages` SELECT policy requires `yap_messages.party_lat IS NOT NULL AND yap_messages.party_lng IS NOT NULL` for the proximity check. Since both are null, the yap is invisible to everyone — including the poster.

### Fix (two parts)

**Part 1: Store GPS coordinates in private party check-in**

`src/components/CheckInModal.tsx` — In `updatePrivatePartyStatus`, use the user's actual GPS coordinates instead of null. The privacy jittering is handled separately at the map display layer, so storing real coords here is fine for proximity-based Yap access.

- Get user's current location before updating status
- Store real `lat`/`lng` in the `night_statuses` upsert (lines 365-366)

**Part 2: RLS policy — allow poster to always see their own yaps**

Update the `yap_messages` SELECT RLS policy to also allow users to see their own private party yaps (as a safety net):

```sql
DROP POLICY IF EXISTS "Yap messages viewable with privacy" ON public.yap_messages;
CREATE POLICY "Yap messages viewable with privacy" ON public.yap_messages
FOR SELECT USING (
  (is_private_party = false)
  OR (auth.uid() = user_id)
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM night_statuses ns
      WHERE ns.user_id = auth.uid()
        AND ns.status = 'out'
        AND ns.lat IS NOT NULL AND ns.lng IS NOT NULL
        AND yap_messages.party_lat IS NOT NULL AND yap_messages.party_lng IS NOT NULL
        AND (6371000 * acos(LEAST(1.0, GREATEST(-1.0,
          cos(radians(ns.lat)) * cos(radians(yap_messages.party_lat))
          * cos(radians(yap_messages.party_lng) - radians(ns.lng))
          + sin(radians(ns.lat)) * sin(radians(yap_messages.party_lat))
        )))) <= 200
    )
  )
);
```

**Part 3: Fix the yap posting fallback**

`src/components/messages/VenueYapThread.tsx` — When `nightStatus.lat`/`lng` are null for a private party, fall back to the user's current GPS position so `party_lat`/`party_lng` are always populated.

### Files changed
- `supabase/migrations/` — new migration (RLS policy update)
- `src/components/CheckInModal.tsx` — store GPS coords in manual private party flow
- `src/components/messages/VenueYapThread.tsx` — GPS fallback when posting private party yaps

