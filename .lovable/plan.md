

## Fix: "Unknown" name in DM thread, swipe freeze, Close Friends empty list

### Root cause analysis

**1. "Unknown" name in Thread header**
`Thread.tsx` line 166-177 joins `profiles:user_id` on `dm_thread_members`. The `profiles` table RLS only allows `auth.uid() = id` (own profile) or `is_demo = true`. So querying another user's profile returns null, and the code defaults to `'Unknown'` (line 194).

**Fix**: Replace the direct `profiles` join with a lookup against the cached `get_profiles_safe` RPC data (which is a SECURITY DEFINER function that returns all profiles with privacy-filtered fields).

**2. Swipe freeze / "Opening chat with Jane" stuck**
In `Messages.tsx`, `location.state?.preselectedUser` is set once when navigating to Messages with a preselected user. When the user navigates back from the thread to `/messages`, React Router preserves `location.state`, so the `preselectedUser` is still set. This triggers `NewChatDialog` to reopen with the loading state. The dialog gets stuck because the thread already exists (the RPC returns the existing thread ID) and navigates again, creating a loop or stale state.

**Fix**: Clear `location.state` after consuming `preselectedUser` using `navigate(location.pathname, { replace: true, state: {} })`. Also ensure the dialog properly resets when closed.

**3. Close Friends page shows no friends**
`CloseFriends.tsx` line 61-63 queries `profiles` table directly with `.in('id', friendIds)`. Same RLS issue — only own profile is readable. Returns empty array → shows "Add friends first" even though friends exist.

**Fix**: Use `get_profiles_safe` RPC instead of direct `profiles` query.

### Files changed

- **`src/pages/Thread.tsx`** — Replace `profiles:user_id` join with `get_profiles_safe` RPC lookup for member names/avatars
- **`src/pages/Messages.tsx`** — Clear `location.state` after consuming `preselectedUser` to prevent re-triggering on back navigation
- **`src/components/messages/NewChatDialog.tsx`** — Add guard to prevent re-creation when dialog reopens with stale preselectedUser
- **`src/pages/CloseFriends.tsx`** — Replace direct `profiles` query with `get_profiles_safe` RPC

