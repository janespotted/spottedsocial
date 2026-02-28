

## Fix: Wrong venue showing for private party friend + Add pull-to-refresh everywhere

### Problem 1: "Le Bain" showing instead of private party
In `MyFriendsTab.tsx`, the status resolution checks `checkins` (active, `ended_at IS NULL`) **before** `night_statuses`. When a friend switches to a private party, their old venue checkin may never get ended, so the stale checkin at "Le Bain" takes priority. Additionally, the `night_statuses` query doesn't select `is_private_party` or `party_neighborhood` fields, so private parties can't be displayed correctly.

**Fix in `MyFriendsTab.tsx`**:
- Select `updated_at, is_private_party, party_neighborhood` from `night_statuses`
- Select `started_at` from `checkins`
- When both a checkin and night_status exist, compare timestamps — prefer whichever is more recent
- For private party statuses, show "Private Party" instead of the venue name
- For the "out" status display, show venue name if available, or "Out" if not

### Problem 2: No pull-to-refresh on Profile, Notifications, Friends (requests/find/invite tabs)
Currently only Home, Feed, Leaderboard, MessagesTab, and MyFriendsTab have pull-to-refresh. Missing from: Profile, Notifications, Friends page (overall).

**Fix**: Add `PullToRefresh` wrapper to:
- `src/pages/Profile.tsx` — wrap main content, refresh profile data + friends count
- `src/pages/Notifications.tsx` — wrap notifications list, refetch notifications
- `src/pages/Friends.tsx` — wrap the entire tabs content area so all tabs get pull-to-refresh (requests tab refetches requests, find tab refetches search, invite tab refetches invite code)

### Files changed
- `src/components/MyFriendsTab.tsx` — fix status resolution to prefer recent night_status over stale checkins, handle private party display
- `src/pages/Profile.tsx` — add PullToRefresh
- `src/pages/Notifications.tsx` — add PullToRefresh
- `src/pages/Friends.tsx` — add PullToRefresh wrapping tabs content

