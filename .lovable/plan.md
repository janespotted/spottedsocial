

## Fix: Friend status showing "home" for private party + no refresh on Friends tab

### Problem 1: Friend at private party shows as "home"
The friend's `location_sharing_level` is set to `close_friends`, so the `night_statuses` RLS blocks regular friends from seeing their status. The query returns no rows, and the code defaults to "home". This is privacy working as intended, but the label is misleading.

**Fix**: Not a bug — this is the privacy setting. However, for friends whose status is blocked by privacy, we should not show "Home" (which is a false claim). Instead show no status indicator or a neutral label.

**Actually** — on second look, the real issue may be that the `night_statuses` query in `MyFriendsTab` is blocked by RLS for a newly-added friend because `can_see_location` depends on `is_direct_friend` which checks the `friendships` table. If the friendship row exists and is accepted, it should work for `all_friends` level — but this user has `close_friends` level. So the friend genuinely can't see their status. This is correct behavior but the "Home" label is wrong — we should show nothing or "Unknown".

### Problem 2: Other person (request sender) doesn't see new friend
When person A accepts B's request, A's cache is invalidated. But B (the sender) has no way to know the request was accepted — their `friend-ids` cache is stale and the Friends page has no pull-to-refresh or auto-refresh.

**Fix**: 
1. Add pull-to-refresh to the My Friends tab
2. Auto-refetch `friend-ids` when the Friends page is focused/navigated to (use React Query `refetchOnWindowFocus` or refetch on tab switch)

### Changes

**`src/components/MyFriendsTab.tsx`**:
- Add pull-to-refresh support using the existing `PullToRefresh` component
- Refetch `friend-ids` query when the tab mounts/becomes visible
- Change "Home" status label to show nothing for friends whose status can't be determined (or keep "Home" but it's technically a privacy gap — the safer approach is to not claim they're home)

**`src/pages/Friends.tsx`**:
- Invalidate `friend-ids` cache when the "Friends" tab is selected, ensuring fresh data
- Add a subtle refresh mechanism

### Files changed
- `src/components/MyFriendsTab.tsx` — add pull-to-refresh + refetch on mount
- `src/pages/Friends.tsx` — trigger refetch when switching to Friends tab

