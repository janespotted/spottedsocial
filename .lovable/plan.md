

## Analysis

I investigated the database thoroughly:
- Both users are friends (verified friendship row exists)
- Both have `is_out = true` with valid coordinates  
- `can_see_location()` returns `true` in BOTH directions
- All RLS policies are PERMISSIVE and correctly configured
- Night statuses exist for both users with `status = 'out'`

The database and permissions are correct. The issue is likely a **client-side caching/timing problem** combined with **inconsistent status resolution logic across surfaces**.

The timestamp-based priority fix (preferring recent night_status over stale checkins) was only applied to `MyFriendsTab.tsx` — but `FriendSearchModal`, `InviteFriendsModal`, and `Map.tsx` still use the old logic that can misclassify friends.

## Plan

### 1. Fix FriendSearchModal status resolution
In `src/components/FriendSearchModal.tsx`:
- Add `started_at` to checkins query, `updated_at, is_private_party, party_neighborhood` to night_statuses query
- Apply same timestamp-comparison logic as MyFriendsTab
- Handle private party display

### 2. Fix InviteFriendsModal status resolution  
In `src/components/InviteFriendsModal.tsx`:
- Same timestamp + private party fixes as above

### 3. Force cache invalidation on app focus
In `src/hooks/useProfilesCache.ts`:
- Reduce `staleTime` to 30 seconds so data refreshes more aggressively
- Add `refetchOnWindowFocus: true` to both `useProfilesSafe` and `useFriendIds` so switching back to the app picks up new friendships and status changes immediately

### 4. Add refetchOnWindowFocus to useFriendIds
In `src/hooks/useFriendIds.ts`:
- Add `refetchOnWindowFocus: true` to ensure new friendships are detected when switching between devices/windows

### Files changed
- `src/components/FriendSearchModal.tsx`
- `src/components/InviteFriendsModal.tsx`  
- `src/hooks/useProfilesCache.ts`
- `src/hooks/useFriendIds.ts`

