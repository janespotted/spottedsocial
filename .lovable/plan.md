

## Plan: Auto-refresh, optional caption, and planning button text fix

### 1. Add visibility-based auto-refresh to Home page
The feed data (`posts`, `planningFriends`, `friends`) only fetches on mount and via realtime. When switching tabs or returning to the app, stale data persists.

**`src/pages/Home.tsx`**:
- Add a `visibilitychange` listener that re-fetches `fetchPosts`, `fetchFriends`, and `fetchPlanningFriends` when the document becomes visible again (with a 30-second throttle to avoid spam)
- Also add `focus` event listener as fallback for browsers that don't fire visibilitychange reliably

**`src/pages/Friends.tsx`**, **`src/pages/Map.tsx`**, **`src/pages/Leaderboard.tsx`**:
- Add similar `visibilitychange` refetch for their primary data queries

### 2. Make caption optional for posts
**`src/lib/validation-schemas.ts`**:
- Change `postSchema.text` from `.min(1)` to `.min(0)` (or make it optional) so empty captions are allowed

**`src/components/PostCaptionScreen.tsx`**:
- Remove `disabled={!caption.trim()}` from the Share button so users can post without a caption
- Update `handleShare` to skip validation when caption is empty, or just allow empty string through validation

### 3. Change "I'm in" to "+ Back to Planning Mode" when user is already out
**`src/components/FriendsPlanning.tsx`** (line ~400-409):
- The bottom CTA currently shows `showJoinOption && !isUserPlanning`. Need to also check if the user is currently "out" (has active night status with `status = 'out'`)
- Add a new prop `isUserOut?: boolean` to `FriendsPlanningProps`
- When `isUserOut` is true, change button text from "I'm in" to "+ Back to Planning Mode"

**`src/pages/Home.tsx`**:
- Pass `isUserOut` prop to `FriendsPlanning` based on the user's current night status (check if they have an active `status = 'out'` record)

### Files changed
- `src/pages/Home.tsx` — visibility-based refetch + pass `isUserOut` prop
- `src/pages/Friends.tsx` — visibility-based refetch
- `src/pages/Map.tsx` — visibility-based refetch
- `src/lib/validation-schemas.ts` — make caption optional
- `src/components/PostCaptionScreen.tsx` — allow posting without caption
- `src/components/FriendsPlanning.tsx` — conditional button text based on user status

