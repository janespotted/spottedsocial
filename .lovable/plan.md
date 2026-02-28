

## Fix: Friends count includes demo users + Add "My Friends" list tab

### Problems
1. **Profile page friends count** (`Profile.tsx` line 255): Counts ALL accepted friendships without filtering out demo users when demo mode is off — shows 24 instead of the real count.
2. **No "My Friends" list**: The Friends page only has Requests/Find/Invite tabs. There's no way to see your actual friends in a list. Need to add a "My Friends" tab.
3. **Stale data after accepting request**: After accepting a friend request on the Friends page, the profile page's friends count and the new friends list won't reflect the change until a full refetch.

### Changes

**`src/pages/Profile.tsx`** — Filter demo friendships from count
- Import `useDemoMode`
- After fetching sent/received friendships (line 255), cross-reference with profiles to exclude demo users when demo mode is off
- Simplest approach: fetch friend IDs, then check profiles for `is_demo` flag, subtract demo friends from count

**`src/pages/Friends.tsx`** — Add "My Friends" tab
- Add a 4th tab "My Friends" between Requests and Find
- Fetch all accepted friendships + their profiles (reuse `useFriendIds` + `useProfilesSafe` pattern)
- Filter out demo profiles when demo mode is off
- Display as a scrollable list with avatars, names, status indicators (out/planning/home)
- Tapping a friend opens their FriendIdCard
- Show status like FriendSearchModal does (out at venue, planning, home)

**Tab layout update**: Change tabs from `Requests | Find | Invite` to `Requests | Friends | Find | Invite`

### Files changed
- `src/pages/Profile.tsx` — filter demo users from friends count
- `src/pages/Friends.tsx` — add "My Friends" tab with full friends list, filter demo from count

