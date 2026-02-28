

## Two Fixes

### 1. Venue invite "No valid recipients" — Root Cause
The `profiles_public` view reads from the `profiles` table which has RLS: users can only SELECT their own profile or demo profiles. So when demo mode is off and we query `profiles_public` for Jane (a real, non-demo user who isn't the current user), RLS blocks the row — the query returns nothing, Jane gets filtered out, and the error fires.

**Fix**: In `VenueInviteContext.tsx`, replace the `profiles_public` query with `get_profiles_safe` RPC (which is `SECURITY DEFINER` and bypasses RLS). Filter the RPC results in JS to find which selected friends are non-demo.

### 2. Thread header cut off at top
The Thread page header (`src/pages/Thread.tsx` line 353) is missing safe-area inset padding. Other pages like Messages use `pt-[max(env(safe-area-inset-top),12px)]` on their sticky header.

**Fix**: Add `pt-[max(env(safe-area-inset-top),12px)]` to the sticky header div in `Thread.tsx`.

### Files changed
- `src/contexts/VenueInviteContext.tsx` — replace `profiles_public` query with `get_profiles_safe` RPC
- `src/pages/Thread.tsx` — add safe-area top padding to header

