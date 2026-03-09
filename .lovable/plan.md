

## Plan: Prevent demo users from appearing in Messages & Activity when demo mode is off

### Root Cause

The `useFriendIds` hook fetches ALL accepted friendships — including friendships with demo users created during demo activation. Downstream components (MessagesTab, ActivityTab) try to filter demo users by checking `is_demo` on cached profiles, but this is fragile:
1. The profiles cache (`profiles-safe`) may not be loaded yet when filtering runs
2. Profile lookups can miss entries, causing demo content to slip through
3. DM threads with demo users persist in the database regardless of demo mode

### Fix: Filter demo users at the source — `useFriendIds`

**`src/hooks/useFriendIds.ts`** — Join against profiles to exclude `is_demo = true` users when demo mode is off. Since RLS prevents direct profile queries, use the `get_profiles_safe` RPC (already cached) to filter.

Changes:
- Accept a `demoEnabled` parameter
- After fetching friend IDs, cross-reference with cached `get_profiles_safe` data to exclude demo users when `demoEnabled` is false
- This eliminates demo users from ALL downstream consumers (Messages, Activity, Map, etc.)

**`src/components/messages/MessagesTab.tsx`** — Pass `demoEnabled` to `useFriendIds` (already has the hook). The existing profile-based filtering becomes a redundant safety net.

**`src/components/messages/ActivityTab.tsx`** — Same: the `friendIds` list used for DM queries will already exclude demo users, so demo DMs won't be fetched at all.

**All call sites of `useFriendIds`** — Update to pass `demoEnabled` from `useDemoMode()`.

| File | Change |
|------|--------|
| `src/hooks/useFriendIds.ts` | Add `demoEnabled` param; filter out `is_demo` friends using profiles cache when demo is off |
| All files importing `useFriendIds` | Pass `demoEnabled` argument |

This is a defense-in-depth fix. The existing per-component `is_demo` filtering stays as a safety net, but the primary filter now happens at the friend ID level so demo users never enter the pipeline.

