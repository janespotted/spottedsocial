

## Plan: Fix Multiple Notification, Demo Data, and Activity Issues

This addresses 5 distinct bugs.

---

### Bug 1: No banner notification when receiving a DM

**Root cause:** The `NotificationBanner` only handles notification types from the `notifications` table. DMs go into `dm_messages` — there's no realtime listener that triggers a banner when a new DM arrives.

**Fix in `src/contexts/NotificationsContext.tsx`:**
- Add a second realtime subscription on `dm_messages` table filtered by threads the user is a member of
- When a new DM arrives from someone else, fetch the sender's profile and create a synthetic notification object with type `dm_message`, then call `setLatestNotification()` to trigger the banner

**Fix in `src/components/NotificationBanner.tsx`:**
- Add `dm_message` to `supportedTypes` array
- Add a blue/purple styling branch for DM banners
- On tap, navigate to `/messages` with the sender as `preselectedUser` (opens the DM thread directly)

---

### Bug 2: Avatar pictures not loading on notification banners

**Root cause:** The `NotificationBanner` uses `latestNotification.sender_profile?.avatar_url` which comes from the `profiles` table. Avatar images are stored in the public `avatars` bucket as full URLs — this should work. The issue is that for realtime notifications, the profile fetch on line 101-105 queries the `profiles` table directly, but RLS may block access to non-friend profiles. Additionally, for notifications fetched on load, profiles are fetched without issue.

**Fix in `src/contexts/NotificationsContext.tsx`:**
- Change the realtime profile fetch (line 101) to use `rpc('get_profile_safe', { target_user_id: ... })` instead of direct table query, which bypasses RLS restrictions
- This ensures `avatar_url` and `display_name` are always populated

---

### Bug 3: Demo data showing in Activity Center when demo mode is OFF

**Root cause:** The Activity Tab at line 182-199 filters notifications by checking if the sender profile exists in the cached `profiles-safe` data and filtering out `is_demo` users. However, the notification query itself (line 167-173) fetches ALL notifications from the DB regardless of whether the sender is a demo user. The filtering relies on cached profiles being available — if the cache is empty, all notifications pass through.

**Fix in `src/components/messages/ActivityTab.tsx`:**
- After fetching notifications, also batch-fetch sender profiles from DB (not just cache) when demo mode is off
- Filter out any notification whose sender has `is_demo = true` when `demoEnabled` is false
- For the DM activities section (line 430+), also filter DMs from demo users when demo mode is off

---

### Bug 4: "Friends Out Now" showing friends from 5+ days ago

**Root cause:** The check-ins query at line 372-383 has NO time filter — it fetches the 10 most recent check-ins from friends regardless of when they occurred. It also doesn't filter by `ended_at IS NULL` (active check-ins only).

**Fix in `src/components/messages/ActivityTab.tsx` (line 372-383):**
- Add `.is('ended_at', null)` to only show active (not ended) check-ins
- Add `.gte('started_at', tonightCutoff)` using `isFromTonight` logic to only show tonight's check-ins
- The `tonightCutoff` is calculated as "5am today" or "5am yesterday" depending on current time (reuse the ephemeral boundary logic)

---

### Bug 5: Accepted meetup/invite should show banner with message option, and original invite should disappear

**Root cause (banner):** The `NotificationBanner` already handles `meetup_accepted` and `venue_invite_accepted` types with emerald styling and a PartyPopper icon. However, there's no "Message" action button on the banner — it just shows text.

**Root cause (disappear):** When a user accepts a meetup (line 553), `setActivities(prev => prev.filter(a => a.id !== activity.id))` removes it locally. This works. But if the user navigates away and comes back, the notification is re-fetched because it's still in the DB (only marked as `is_read`, not deleted). The activity card reappears.

**Fix in `src/components/NotificationBanner.tsx`:**
- For accepted types, show the sender's avatar (fetch profile) instead of just the PartyPopper icon
- Add a "Message" button on the banner that opens a DM with the sender
- Keep the PartyPopper as a smaller badge overlay

**Fix in `src/components/messages/ActivityTab.tsx`:**
- When accepting a meetup/venue invite, delete the notification from the DB (not just mark as read) so it doesn't reappear on reload
- Filter out `is_read` meetup_request and venue_invite notifications from the activity list (accepted = read = hide)

---

### Summary of files to change

| File | Changes |
|------|---------|
| `src/contexts/NotificationsContext.tsx` | Add DM realtime listener; fix profile fetch to use RPC |
| `src/components/NotificationBanner.tsx` | Add `dm_message` type; show avatar on accepted banners; add Message button |
| `src/components/messages/ActivityTab.tsx` | Filter demo data properly; add tonight-only filter for check-ins; delete notifications on accept |

