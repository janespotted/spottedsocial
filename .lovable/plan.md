

## Fix: Tapping own username navigates to profile instead of opening Friend ID Card

### Problem
Tapping your own name/avatar anywhere (feed, comments, etc.) opens a Friend ID Card of yourself, which is wrong. It should navigate to your profile page.

### Solution
Modify `FriendIdCardContext.tsx` to add the self-check directly in `openFriendCard`. Since the context wraps the whole app, adding `useAuth` and `useNavigate` there handles all 17+ call sites at once — no per-component changes needed.

### Change

**`src/contexts/FriendIdCardContext.tsx`**:
- Import `useAuth` and `useNavigate`
- In `openFriendCard`, check if `friend.userId === user?.id`
  - If yes: call `navigate('/profile')` instead of setting state
  - If no: proceed as before (open the card)

### Files changed
- `src/contexts/FriendIdCardContext.tsx`

