

## Fix: Friend ID Card shows stale venue + Activity tab shows duplicate/broken check-ins

### Problem 1: Friend ID Card shows "Le Bain" instead of private party
`FriendIdCard.fetchUserStatus()` (line 156) queries `night_statuses` but only selects `status, planning_neighborhood` — it doesn't check for `is_private_party` or the `out` status with a venue. It then falls through to `checkins` and finds the stale "Le Bain" check-in (never ended). Same timestamp comparison fix needed here as was done in `MyFriendsTab`.

**Fix in `src/components/FriendIdCard.tsx`**:
- Expand `night_statuses` query to select `status, planning_neighborhood, venue_name, is_private_party, party_neighborhood, updated_at`
- Handle `status === 'out'` from night_statuses (not just `planning`)
- When night_status is `out` and is more recent than the active checkin, use it instead
- For private parties: show "@ Private Party (Neighborhood)" instead of the stale checkin venue

### Problem 2: Activity tab shows every check-in per user (duplicates) with missing name/avatar
The check-in query (line 350-362) fetches the last 10 check-ins from friends with no deduplication — if a friend has 3 check-ins, all 3 show up. The `profiles` join via `profiles:user_id` may also fail silently due to RLS, returning null `display_name` and `avatar_url`.

**Fix in `src/components/messages/ActivityTab.tsx`**:
- After fetching check-ins, deduplicate by `user_id` — keep only the most recent check-in per friend
- Use the cached `profiles-safe` data (already available via queryClient) as fallback when the join returns null profiles
- For private party check-ins (venue_name = 'Private Party'), display appropriately

### Files changed
- `src/components/FriendIdCard.tsx` — fix status resolution to check night_statuses `out` status + private party before falling back to checkins
- `src/components/messages/ActivityTab.tsx` — deduplicate check-ins to one per user, fix missing profile data

