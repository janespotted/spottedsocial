

## Bug: Yaps at venues marked as private party due to stale night_status

### Root Cause

In `VenueYapThread.tsx` (lines 410-414), when a user posts a yap, the code checks their `night_statuses` to determine if they're at a private party:

```typescript
const { data: nightStatus } = await supabase
  .from("night_statuses")
  .select("id, is_private_party, lat, lng")
  .eq("user_id", user!.id)
  .maybeSingle();
```

This query has **no filter for active/non-expired statuses**. If the user checked into a private party earlier that night and then moved to a regular venue, the old `night_statuses` row (with `is_private_party = true`) can still be returned. The yap then gets inserted with `is_private_party = true` and a `party_id`.

The RLS policy (`"Yap messages viewable with privacy"`) only shows `is_private_party = false` yaps publicly. Private party yaps require proximity (200m), so these mis-tagged yaps become invisible to everyone except the author.

### Fix

**File: `src/components/messages/VenueYapThread.tsx`** (lines 410-414)

Add filters to only consider active, non-expired night statuses with `status = 'out'`:

```typescript
const { data: nightStatus } = await supabase
  .from("night_statuses")
  .select("id, is_private_party, lat, lng, status")
  .eq("user_id", user!.id)
  .not('expires_at', 'is', null)
  .gt('expires_at', new Date().toISOString())
  .eq('status', 'out')
  .maybeSingle();
```

Additionally, only set `isPrivateParty = true` when there is no explicit venue context (i.e., the thread is already for a named venue, so the yap should not be tagged as private party):

```typescript
if (nightStatus?.is_private_party && !venueName) {
```

Or more robustly — if the thread was opened for a specific named venue (not a private party thread), skip the private party tagging entirely:

```typescript
if (nightStatus?.is_private_party && partyId) {
  // Only tag as private party if this thread IS a private party thread
```

### Data Fix

Run a data update to fix existing mis-tagged yaps. This will use the insert tool (data operation):

```sql
UPDATE yap_messages 
SET is_private_party = false, party_id = null, party_lat = null, party_lng = null
WHERE is_private_party = true 
  AND venue_name IS NOT NULL 
  AND venue_name != '';
```

This covers all venues, not just "The Penthouse at Huntley".

| Step | Action |
|------|--------|
| Code fix | Add expiry/status filters to night_statuses query in VenueYapThread.tsx |
| Code fix | Only tag yap as private party when thread is actually a private party thread |
| Data fix | Update all mis-tagged yap_messages where venue_name exists but is_private_party = true |

