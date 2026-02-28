

## Fix: Private Party "You're at" bar not showing

**Root cause**: The user's `night_statuses` row for a private party has `venue_name = NULL`. The `fetchUserVenue` query on line 65 filters with `.not('venue_name', 'is', null)`, which excludes private party records entirely. The "You're at" bar never renders.

### Changes

**`src/components/messages/YapTab.tsx`**:

1. **Update `fetchUserVenue` query** — Remove the `.not('venue_name', 'is', null)` filter. Instead, query for active statuses where the user is either at a venue OR at a private party. After fetching, derive a display name:
   - If `venue_name` is set, use it
   - If `is_private_party` is true and `venue_name` is null, use `"Private Party"` (with neighborhood if available from `party_neighborhood`)

2. **Update the query select** — Add `party_neighborhood` to the select so we can display "Private Party · Wilshire" in the bar.

3. **Update display in "You're at" bar** — When `userIsPrivateParty` is true and the venue name was derived as "Private Party", show it with the neighborhood context.

4. **Thread access for private parties** — When opening a thread for a private party, the `VenueYapThread` uses `venue_name` to filter `yap_messages`. Since private party yaps are stored with the party's venue_name (which may also be null or a generated name), we need to ensure a consistent key. The fix: when inserting a private party night_status, the venue_name should be set. But since we can't change existing data right now, we'll use a fallback key like `"Private Party @ {neighborhood}"` for the thread, matching what gets stored in yap_messages.

### Specific code changes

**Lines 60-70** — Update `fetchUserVenue`:
```typescript
const fetchUserVenue = async () => {
  const { data } = await supabase
    .from('night_statuses')
    .select('venue_name, is_private_party, party_neighborhood')
    .eq('user_id', user.id)
    .not('expires_at', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .neq('status', 'home')
    .maybeSingle();
  
  if (data?.is_private_party) {
    const displayName = data.venue_name || `Private Party${data.party_neighborhood ? ` · ${data.party_neighborhood}` : ''}`;
    setUserVenueName(displayName);
    setUserIsPrivateParty(true);
  } else {
    setUserVenueName(data?.venue_name || null);
    setUserIsPrivateParty(false);
  }
};
```

**Lines 86-91** — Update realtime handler similarly to handle null venue_name for private parties.

### Files changed
- `src/components/messages/YapTab.tsx`

