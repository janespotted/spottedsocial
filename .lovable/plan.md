

## Add Yap Board for Private Parties

**Problem**: The Yap directory feed explicitly filters out private party yaps (line 111: `.eq('is_private_party', false)`), and private parties don't have venue entries in the `venues` table, so they also fail the city-based metadata lookup. Users at private parties have no way to see or participate in a Yap board for their party.

### Changes

**`src/components/messages/YapTab.tsx`**:

1. **Include private party yaps in the feed** — Remove the `.eq('is_private_party', false)` filter. Instead, run a second query for private party yaps (where `is_private_party = true`) and merge them into the feed.

2. **Handle missing venue metadata for private parties** — Private parties don't exist in the `venues` table. For yaps where `is_private_party = true`, use the `venue_name` as-is (it will be something like "Private Party") and pull the neighborhood from the yap's associated `night_statuses` or from a `party_neighborhood` field if stored on the yap.

3. **Show private party entries in the directory** — Display private party yap cards with a house icon instead of the map pin, and show the neighborhood as the location context (e.g., "🏠 Private Party · Hollywood").

4. **Allow thread access** — When a user taps a private party yap card, open a `VenueYapThread` using the private party's venue_name. The existing `VenueYapThread` component already supports private party yaps (it checks `is_private_party` when posting).

5. **Update "You're at" bar** — If the user's `night_status` has `is_private_party = true`, show "You're at Private Party" with the house icon instead of the map pin.

### Files changed
- `src/components/messages/YapTab.tsx`

