

## Fix Stale Check-in Data Across Messages, Friend ID Card, and Related Components

### Problem
After the 5am reset, several components still show stale venue/check-in data:
- **MessagesTab**: Shows thread list entries with old venue names, and threads from previous nights still appear (even though messages are cleared)
- **NewChatDialog**: Shows friends' venue status without checking expiry
- **FriendIdCard**: Active checkin query has no tonight filter; "last ended check-in" can show data from days ago
- **ActivityTab**: Fetches night status without expiry check

### Changes

#### 1. `src/components/messages/MessagesTab.tsx`
- Add `expires_at` filter to the `night_statuses` query (line ~147-149): `.not('expires_at', 'is', null).gt('expires_at', new Date().toISOString())`
- Only show threads that have messages from tonight (already filters messages via `isFromTonight`, but threads with zero tonight messages still render — hide those)

#### 2. `src/components/messages/NewChatDialog.tsx`
- Add `expires_at` filter to the `night_statuses` query (line ~96-99): `.not('expires_at', 'is', null).gt('expires_at', new Date().toISOString())`

#### 3. `src/components/FriendIdCard.tsx`
- **Active checkin query** (line ~165-172): Add `.gt('started_at', twentyFourHoursAgo)` to prevent zombie check-ins from days/weeks ago showing as active
- **Last ended check-in query** (line ~275-282): Add tonight filter using `isFromTonight` — if the ended check-in is from a previous night, show "Not out tonight" instead of stale venue data

#### 4. `src/components/messages/ActivityTab.tsx`
- Add `expires_at` filter to the night status query (line ~193): `.not('expires_at', 'is', null).gt('expires_at', new Date().toISOString())`

### Summary
All components will consistently filter check-in/venue data by expiry, matching what the map already does. After 5am, no stale venue names or thread entries from previous nights will appear.

