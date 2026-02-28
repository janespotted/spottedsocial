

## Problem

Jane shows as "At Cucina" in the Invite Friends modal, but she's actually at a Private Party (Wilshire). The database confirms:

- Jane (user `3ff01fb3`) has **3 stale open checkins** at "Cucina" from **November 2025** that were never closed (`ended_at IS NULL`)
- Her night_status correctly shows "Private Party (Wilshire)" updated today
- The timestamp comparison logic should prefer night_status, but the checkins query returns results in **no guaranteed order** and the code keeps only the first result per user

The deeper issue: the checkins query (`ended_at IS NULL`) returns ALL historical open checkins with no recency filter. While the timestamp logic usually handles this, there are edge cases where it fails, and these zombie checkins waste bandwidth.

## Fix

### 1. Add recency filter to checkins queries
In both `InviteFriendsModal.tsx` and `FriendSearchModal.tsx`, add `.order('started_at', { ascending: false })` to the checkins query so the most recent checkin is stored in the map (not a random old one). Also add a 24-hour recency filter (`.gt('started_at', twentyFourHoursAgo)`) to exclude ancient zombie checkins.

### 2. Clean up orphaned checkins in the database
Run a migration to close all checkins older than 48 hours that still have `ended_at IS NULL`, setting their `ended_at` to their `started_at + 6 hours` to prevent future recurrence of this bug.

### 3. Add auto-close logic for stale checkins
Update the checkins query pattern to include a `started_at` floor (e.g., 24 hours ago) so even if old checkins aren't cleaned up, they're never fetched.

### Files changed
- `src/components/InviteFriendsModal.tsx` — add `.order('started_at', { ascending: false })` and 24h floor to checkins query
- `src/components/FriendSearchModal.tsx` — same fix
- Database migration — close orphaned checkins

