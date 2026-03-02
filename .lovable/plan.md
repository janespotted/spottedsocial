

## Add "Rally" Feature for Friends Not Currently Out

### Overview
Add a "Rally" button to nudge friends who are in the "Not Sharing" section to come out tonight. Tapping sends a notification via the existing `create_notification` RPC. The recipient sees the rally in their Activity feed with action buttons to respond.

### Changes

**`src/components/MyFriendsTab.tsx`**
- Add `ralliedIds` state (`Set<string>`) for session-based spam prevention
- Add `handleRally(friendId, friendName)` — calls `supabase.rpc('create_notification', { p_receiver_id, p_type: 'rally', p_message })` with message format: "[Name] wants you to rally. Come out tonight! 👋"
- Import `Megaphone` from lucide-react and `toast` from sonner
- Fetch current user's display name from profiles cache for the message
- In `renderRow`: for `hidden` status friends, replace the `EyeOff` icon with a Rally button (small `Megaphone` icon). After rallying, show "Rallied ✓" disabled state. Use `e.stopPropagation()` to prevent opening the friend card.

**`src/components/messages/ActivityTab.tsx`**
- Add `'rally'` to the Activity `type` union and to the notification types fetched from the DB (line 170 `.in('type', [...])`)
- Add `Megaphone` to lucide imports
- In `getActivityIcon`: return a megaphone icon for `'rally'` type
- In notification-to-activity mapping: handle `'rally'` type with title = sender name, subtitle = rally message
- In `renderActivityCard` content section: add a `rally` type block showing "[Name] wants you to rally!"
- In actions section: add two buttons for rally type — "Go Live" (navigates to check-in flow via `openCheckIn()`) and "Message" (opens DM with the rallier)
- Add `'rally'` to the activity grouping — show rallies in a new "Rallies" section or within "Invites to You"
- Import `useCheckIn` context for the "Go Live" button

**`src/pages/Friends.tsx`**
- In the search results section (lines 586-621): when a result is an existing friend (`friendshipStatuses[id] === 'accepted'`), check if they're in the "hidden" status (not out/planning). If so, show a Rally button instead of the "Friends" badge. This requires knowing their status — use the same night_statuses/checkins data that MyFriendsTab fetches, or simpler: just show the Rally button for any accepted friend in search results (since if they were out you'd see that in the friends list anyway).

### No database changes needed
The `notifications` table `type` column is `text` — no migration required. The existing `create_notification` RPC, push notification flow, and realtime subscriptions will all work with the new `'rally'` type automatically.

### Files modified
- `src/components/MyFriendsTab.tsx`
- `src/components/messages/ActivityTab.tsx`
- `src/pages/Friends.tsx`

