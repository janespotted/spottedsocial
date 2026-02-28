

## Three Fixes

### 1. Venue invite "No valid recipients" — still broken
The code at line 52-56 still queries `profiles_public` which is a view on the `profiles` table with RLS. RLS blocks reading other users' rows, so Jane's row returns nothing and she gets filtered out.

**Fix**: Replace the `profiles_public` query with `get_profiles_safe` RPC (which is `SECURITY DEFINER` and bypasses RLS). Filter the results in JS.

### 2. Thread header cut off at top
Line 353 in `Thread.tsx` — the sticky header div is missing safe-area padding.

**Fix**: Add `pt-[max(env(safe-area-inset-top),12px)]` to the sticky header div.

### 3. Add Event dialog — convert to smooth full-screen overlay
`CreateEventDialog.tsx` uses a vaul `Drawer`. Convert it to a full-screen `fixed inset-0` overlay with `animate-fade-in`, matching the pattern now used by Share a Plan and FriendSearchModal. Add `ArrowLeft` back button in header.

### Files changed
- `src/contexts/VenueInviteContext.tsx` — replace `profiles_public` query with `get_profiles_safe` RPC
- `src/pages/Thread.tsx` — add safe-area top padding to header
- `src/components/CreateEventDialog.tsx` — convert from Drawer to full-screen overlay

