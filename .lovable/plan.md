

# Make Pinned Venue Yap Messages Publicly Visible

## Problem
The current SELECT RLS policy on `venue_yap_messages` requires `auth.uid() IS NOT NULL`, which blocks unauthenticated users from seeing pinned venue announcements.

## Current Policy
```sql
-- "Authenticated users can view venue yap messages"
USING ((auth.uid() IS NOT NULL) AND ((expires_at IS NULL) OR (expires_at > now())))
```

## Plan

### 1. Update the SELECT RLS policy on `venue_yap_messages`

Drop the existing SELECT policy and replace it with two policies:

**Policy A — Pinned messages visible to everyone (including anonymous):**
```sql
CREATE POLICY "Anyone can view pinned venue yap messages"
  ON venue_yap_messages FOR SELECT
  USING (is_pinned = true AND (expires_at IS NULL OR expires_at > now()));
```

**Policy B — Non-pinned messages visible to authenticated users only:**
```sql
CREATE POLICY "Authenticated users can view non-pinned venue yap messages"
  ON venue_yap_messages FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_pinned = false AND (expires_at IS NULL OR expires_at > now()));
```

### 2. No code changes needed
The frontend `VenueYapThread` component already queries `venue_yap_messages` by `venue_id` — it will automatically pick up pinned messages once the RLS policy allows it.

### Technical Note
Multiple `FOR SELECT` policies on the same table are combined with OR logic (since they're both PERMISSIVE = false / restrictive — actually these are created as permissive by default). This means a row is visible if **either** policy matches, which is the desired behavior.

