

## Fix: Unique Yap Feeds for Each Private Party

### Problem
Private party Yap feeds are grouped by `venue_name` (e.g., "Private Party · Wilshire"), so all private parties with the same neighborhood share one Yap thread. Named venues are fine since they have unique names.

### Approach
Add a `party_id` column to `yap_messages` that stores the `night_statuses.id` of the private party check-in. For private parties, query/filter by `party_id` instead of `venue_name`. Named venues continue using `venue_name`.

### Changes

**1. Database Migration**
- Add nullable `party_id UUID` column to `yap_messages`

**2. `src/components/messages/VenueYapThread.tsx`**
- Accept new prop `partyId?: string` alongside `venueName`
- When posting a private party yap: look up the user's `night_statuses.id` and store it as `party_id`
- `fetchYapMessages`: if `partyId` is provided, filter by `party_id=eq.{partyId}` instead of `venue_name`
- `subscribeToYaps`: same filter change for realtime

**3. `src/components/messages/YapTab.tsx`**
- When fetching user venue from `night_statuses`, also store the `night_statuses.id` as `userPartyId`
- Pass `partyId` to `VenueYapThread` when opening a private party thread
- Private party yaps in the directory: group by `party_id` instead of `venue_name`
- `fetchQuotes`: for private party yaps, include `party_id` in the select, group by it

**4. `src/hooks/useYapNotifications.ts`**
- For private party notifications: filter realtime subscription by `party_id` matching the user's current `night_statuses.id`, not by `is_private_party=eq.true`

**5. `src/pages/Messages.tsx`**
- Pass `partyId` through navigation state alongside `venueName` and `isPrivateParty`

### Data Flow
```text
Check-in → night_statuses row (id = abc-123)
                ↓
User posts yap → yap_messages.party_id = abc-123
                ↓
Thread filter → WHERE party_id = 'abc-123' (not venue_name)
```

Named venues remain unchanged — they continue filtering by `venue_name`.

