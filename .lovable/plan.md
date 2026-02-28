

## Two Issues

### 1. "Who's Going Out Tonight" → "Planning on Going Out"
In `src/components/FriendsPlanning.tsx` line 211, rename the heading text.

### 2. "No valid recipients selected" toast when inviting Jane
**Root cause**: In `VenueInviteContext.tsx` (lines 50-60), when demo mode is off, `sendInvites` queries the `profiles` table to filter out demo users. But the `profiles` table has strict RLS — you can only read your own profile or demo profiles. So querying for Jane's profile with `.eq('is_demo', false)` returns nothing (RLS blocks it), Jane gets filtered out, and you get the error.

**Fix**: Replace the `profiles` table query with a query to `profiles_public` (a view with no RLS restrictions), which already has the `is_demo` column. This lets the demo-user filter work correctly without hitting RLS.

### Files changed
- `src/components/FriendsPlanning.tsx` — rename heading
- `src/contexts/VenueInviteContext.tsx` — change `from('profiles')` to `from('profiles_public')` in the demo-user filter query

