

## Fix: InviteFriendsModal (and FriendSearchModal) show "No friends found"

**Root cause**: Both modals query `profiles` table directly, but RLS only allows reading your own profile or demo profiles. Friend profiles are invisible, so the query returns empty results.

**Working pattern**: Other components (PrivatePartyInviteModal, NewChatDialog, VenueIdCard) use `useProfilesSafe()` which calls the `get_profiles_safe` RPC — this bypasses the restrictive SELECT policy and returns all visible profiles.

### Changes

**`src/components/InviteFriendsModal.tsx`**:
- Replace direct `supabase.from('profiles').select(...)` query with `useProfilesSafe()` hook
- Filter the cached profiles by `friendIds` in-memory (same pattern as PrivatePartyInviteModal)
- Keep the checkins + night_statuses queries as-is (those tables have correct RLS)

**`src/components/FriendSearchModal.tsx`**:
- Same fix: replace direct `profiles` query with `useProfilesSafe()` + in-memory filter

### Files changed
1. `src/components/InviteFriendsModal.tsx`
2. `src/components/FriendSearchModal.tsx`

