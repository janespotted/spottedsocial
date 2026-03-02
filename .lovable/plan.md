

## Plan: Simplify Friends Page to 2 Tabs

### Overview
Consolidate the 4-tab Friends page (Requests, Friends, Find, Invite) into 2 tabs: **Friends** (default) and **Invite**.

### Changes — `src/pages/Friends.tsx` only

**Tab structure**: Replace 4 TabsTriggers with 2 centered ones ("Friends" and "Invite"), keeping the yellow/green active highlight style.

**"Friends" tab content** (combines old Requests, Friends, and Find tabs):

1. **Unified search bar** at the top — placeholder "Search by name or username...". When empty, shows the friend list below. When typing (2+ chars), searches both existing friends AND all Spotted users in one results list (friends show status, non-friends show Add button). Reuses the existing `searchUsers` + `MyFriendsTab` filtering logic.

2. **Pending requests banner** — If `requests.length > 0`, show a compact card: "You have X friend requests" with a chevron. Tapping expands an inline list of request cards (same accept/decline UI as current Requests tab). When no requests, banner is hidden entirely.

3. **"Manage Close Friends" link** — Small text button near the search bar area (e.g., right-aligned below search), navigates to `/profile/close-friends`.

4. **Friend list** — Render `MyFriendsTab` content inline (Out Now → Planning → Not Sharing sections), exactly as current.

**"Invite" tab**: No changes — keep as-is (lines 813-874).

**State changes**: Default tab becomes `'friends'` instead of `'requests'`. Remove the `'find'` and `'requests'` tab values. The `suggestedFriends` "People You May Know" section moves into the Friends tab, shown below the friend list when search is empty.

### Files modified
- `src/pages/Friends.tsx` — restructure tabs, merge search + requests + friends into one tab

