

## Fix: Hide demo users everywhere when demo mode is off

### Problem
Several components still show demo users when demo mode is disabled:
1. **ShareToDMModal** — no demo filtering at all
2. **Friends page** — friend requests, search results, and suggested friends all include demo profiles
3. **FindFriendsOnboarding** — search results include demo profiles
4. **MessagesTab** — uses `bootstrapEnabled && !demoEnabled` instead of just `!demoEnabled`
5. **ActivityTab** — same inconsistent `bootstrapEnabled && !demoEnabled` pattern

### Changes

**`src/components/ShareToDMModal.tsx`**
- Add `useDemoMode` hook import
- Filter `allProfiles` to exclude `is_demo = true` profiles when demo mode is off (in the `useEffect` that builds the friends list)

**`src/pages/Friends.tsx`**
- Add `useDemoMode` hook
- `fetchRequests`: After fetching pending friend requests, filter out requests from demo users (check profile `is_demo`) when demo mode is off
- `searchUsers`: Filter out demo profiles from `get_profiles_safe` results when demo mode is off
- `fetchSuggestedFriends`: Filter the final suggestions list to exclude demo profiles when demo mode is off

**`src/components/FindFriendsOnboarding.tsx`**
- Add `useDemoMode` hook
- Filter search results from `get_profiles_safe` to exclude demo profiles when demo mode is off

**`src/components/messages/MessagesTab.tsx`**
- Simplify filter from `bootstrapEnabled && !demoEnabled` to just `!demoEnabled` (remove bootstrap dependency)

**`src/components/messages/ActivityTab.tsx`**
- Same simplification: replace all `bootstrapEnabled && !demoEnabled` checks with `!demoEnabled`

### Pattern
Every component will use the same check: `if (!demoEnabled) { filter out is_demo === true }`. No bootstrap mode dependency needed — demo visibility is solely controlled by the demo mode toggle.

### Files changed
- `src/components/ShareToDMModal.tsx`
- `src/pages/Friends.tsx`
- `src/components/FindFriendsOnboarding.tsx`
- `src/components/messages/MessagesTab.tsx`
- `src/components/messages/ActivityTab.tsx`

