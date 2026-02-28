

## Fix: Private Party Yap — pinned at top only, not in public feed

**Problem**: Private party yaps are currently mixed into the public Yap directory feed. They should only appear via the "You're at" bar when the user is checked into a private party — identical to how real venues work.

### Changes

**`src/components/messages/YapTab.tsx`**:

1. **Remove the private party yap query** — Delete the second query (lines 121-130) that fetches `is_private_party = true` yaps and all related private party enrichment logic (neighborhood lookup from `night_statuses`, `enrichedPrivate` array, merge into quotes).

2. **Keep the "You're at" bar working for private parties** — The existing `userVenueName` + `userIsPrivateParty` state already handles this correctly. When a user is at a private party, the bar shows with the Home icon and links to the `VenueYapThread`. No changes needed here.

3. **Result**: Private party Yap boards are accessible only through the "You're at" shortcut bar (pinned at top), never visible in the public directory feed.

### Files changed
- `src/components/messages/YapTab.tsx`

