

## Pre-Launch Audit — Full Report

---

### AUDIT #1: Location Tracking & Check-In Flow

**What happens when a user taps "I'm here":**
1. User opens "Are you out?" modal (`CheckInModal`)
2. Taps "Yes, I'm Out" → privacy selector appears (close friends / all friends / mutual friends)
3. After selecting privacy → `captureLocationWithVenue()` fires
4. GPS is captured via `getCurrentLocation()` (single-shot, `enableHighAccuracy: true`, 10s timeout, `maximumAge: 0`)
5. `findNearbyVenues()` queries the DB function `find_nearby_venues` within 500m
6. Nearest venue is auto-selected; user sees venue name and can edit or pick from dropdown
7. On confirm: ends any active check-ins, inserts new `checkins` row, upserts `night_statuses` with `status = 'out'`, updates `profiles` with lat/lng

**GPS accuracy threshold:** 35m for the venue arrival nudge system (`GPS_ACCURACY_THRESHOLD = 35` in `trigger.ts`). However, the **manual check-in flow has NO accuracy gate** — `captureLocationWithVenue()` uses raw `getCurrentLocation()` with no accuracy check. A user with 200m accuracy GPS could still check in.

**What happens if GPS puts them 2 blocks away:** The system finds the nearest venue within 500m. If they're 2 blocks (~200m) from a venue, that venue will still appear in the dropdown. The user can also type any custom venue name and check in there. **There is no server-side radius enforcement on manual check-ins.** A user could theoretically check in to a venue across the city if they enter a custom name.

**Radius check:** 
- Venue arrival nudge (automatic): 200m trigger radius, 500m detection radius
- Manual check-in: 500m radius for venue suggestions, but **no hard block** if no venue is found — user just enters a custom name

**Can users check in without being physically near?** Yes. The manual check-in captures GPS but doesn't enforce proximity. If GPS fails, a toast error appears, but there's no radius enforcement on the server. The only gating is that `getCurrentLocation()` must succeed.

**What happens if GPS signal is lost after check-in:** Status stays live. Location updates poll every 60 seconds (`startLocationTracking` in `CheckInModal`), but if GPS fails, it silently logs an error and continues. The check-in doesn't auto-end.

**When does a check-in automatically expire:** At 5:00 AM local time. `calculateExpiryTime()` sets `expires_at` to 5 AM. The `night_statuses` row's `expires_at` is checked on read. There is **no server-side cron that actively deletes expired statuses** — expiry is enforced by clients checking `expires_at` on read. The `refresh-leaderboard-energy` function does delete expired demo statuses.

**ISSUES FOUND:**
- Manual check-in has no GPS accuracy gate (the nudge system has 35m, but manual has 0)
- No server-side proximity enforcement — users can check in anywhere
- No server-side cron to clean up expired real-user `night_statuses` — relies on client-side filtering
- `startLocationTracking` uses single-shot `getCurrentPosition` (not the multi-sample `getAccurateLocation`), so background updates may drift

---

### AUDIT #2: Realtime Updates & Performance

**How quickly does User B see User A's check-in:**
There is **only ONE realtime subscription** in the entire app — `feed-realtime` in `useRealtimeSubscriptions.ts`. It listens for:
- `INSERT` on `posts` table
- `DELETE` on `posts` table
- `*` (all events) on `post_likes` table

**The map, friends list, and leaderboard have ZERO realtime subscriptions.** They are all fetch-on-mount with no live updates.

**Polling inventory:**
1. `useVenueArrivalNudge`: Polls GPS every 15 seconds when user status is "out" — but this is for venue detection, not for showing other users
2. `CheckInModal.startLocationTracking`: Polls GPS every 60 seconds to update own profile location
3. `Layout.tsx`: Checks check-in reminder every 30 seconds (localStorage only)
4. `VenueYapThread`: Interval for cooldown timer and pinned message expiry (UI only)

**Expected latency for a friend appearing on the map:** There is NO automatic update. User B must:
- Pull-to-refresh the map page, OR
- Navigate away and back to the map

**ISSUES FOUND:**
- Map page fetches friend locations on mount only — no realtime, no polling
- Leaderboard has no realtime updates — shows stale data until refresh
- Friends list/planning section has no realtime — manual refresh required
- The only realtime channel is for the feed (posts + likes), nothing for check-ins or statuses
- No realtime subscription for `night_statuses` changes — this is the biggest gap for a "see who's out right now" app

---

### AUDIT #3: Offline Behavior & Error States

**Opening app with no internet:**
- `OfflineBanner` component detects `navigator.onLine === false` and shows "You're offline. Some features may not work."
- `useOfflineCache` provides 30-minute localStorage cache for posts and friends data
- The Home page can show cached posts if available; otherwise, queries fail silently
- Map will fail to load (Mapbox requires network), showing a blank page
- Leaderboard, Messages will show loading states that never resolve

**Connection drops mid-check-in:**
- The check-in flow makes 3-4 sequential Supabase calls (end old check-ins, insert new check-in, upsert night_status, update profile)
- If connection drops mid-sequence, **partial state is possible**: e.g., old check-in ended but new one not created
- There is **no transaction wrapping** these operations
- A toast error appears: "Location error — Could not get your location" (though this is the GPS error, not network)

**Error messages the user sees:**
- Failed check-in: "Location error — Could not get your location. Please try again." or "Failed to enable location sharing"
- Failed post upload: No explicit offline handling — the post creation would fail with a generic error
- Failed message send: No explicit error handling visible — messages would fail silently or show a Supabase error
- Failed friend request: No explicit retry — the request would fail with a toast error

**Retry mechanisms:**
- `src/lib/retry.ts` exists with `withRetry()` (exponential backoff, 3 attempts, 500ms base delay)
- However, **it is not imported or used anywhere in the app**. It's dead code.
- No operations in the app actually retry on failure

**ISSUES FOUND:**
- `retry.ts` utility exists but is never used — no operations retry
- Check-in flow has no transaction safety — partial state possible on network failure
- Map page has no offline fallback (blank page)
- Messages have no offline queue or retry
- Post upload has no retry or offline draft saving

---

### AUDIT #4: Onboarding & First-Time Experience

**Complete new user flow:**
1. User opens app → sees Auth page (login/signup)
2. Signs up with email/password (email verification required — auto-confirm is NOT enabled)
3. Verifies email, logs in
4. `useOnboarding` checks `profiles.has_onboarded` — if `false`, shows `OnboardingCarousel`
5. **Carousel slides (4 slides):** Welcome to Spotted → Share Your Location → Send Meet Ups → Share Your Night
6. Can tap backdrop to skip to Find Friends, or tap "Next" through all 4 slides
7. **Find Friends step** (`FindFriendsOnboarding`): Search for friends by username OR share/copy invite link
8. **Gate requirement:** Must add 2+ friends OR send 1 invite (share/copy counts). Continue button disabled until met.
9. If user tries to skip without meeting requirement → confirmation modal: "Spotted works best with friends. Are you sure?"
10. After confirming skip or meeting requirement → `has_onboarded = true` → lands on Home page

**How long:** 30 seconds to 2 minutes depending on whether they add friends

**Minimum required:** User can skip the carousel (tap backdrop), then skip Find Friends (with confirmation). Minimum is ~4 taps to reach the main app.

**Location permission:** NOT requested during onboarding. Only requested when user first tries to check in ("Yes I'm Out") or when the venue arrival nudge triggers.

**App with zero friends and zero activity — every tab:**
- **Home (Feed):** `NoFriendsBanner` appears if 0 friends. Below that, empty feed with "No posts yet" empty state. In bootstrap mode, promotional venue cards may appear.
- **Leaderboard:** Shows venue rankings populated by demo data (bootstrap mode). Works fine with 0 friends.
- **Map:** Shows venue pins from demo data. No friend bubbles. The user's own pin appears if they check in.
- **Messages:** Empty state — no conversations. Activity tab may show notifications but likely empty.
- **Profile:** Shows user's own profile with 0 friends count, empty posts section.

**ISSUES FOUND:**
- No location permission request during onboarding — first check-in may feel jarring when the browser permission popup appears
- No push notification permission request during onboarding — only requested when setting a reminder

---

### AUDIT #5: iOS/Capacitor Readiness

**Current Capacitor setup:** Already configured with `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, and several plugins (`browser`, `camera`, `clipboard`, `haptics`, `push-notifications`, `share`).

**Web APIs that won't work in WKWebView:**
- Service Worker: Already handled — `main.tsx` skips SW registration on native (`Capacitor.isNativePlatform()`)
- `navigator.geolocation`: Works in WKWebView — compatible
- `localStorage`: Works in WKWebView — compatible
- `navigator.permissions.query`: May not work in WKWebView — but `checkLocationPermission()` has a fallback returning `'prompt'`

**Platform-specific handling already in place (`src/lib/platform.ts`):**
- `APP_BASE_URL` hardcoded to `https://spottedsocial.lovable.app`
- `getRedirectOrigin()` returns `APP_BASE_URL` on native (not `capacitor://localhost`)
- OAuth redirects handled via `@capacitor/browser` (in-app Safari)
- Clipboard uses `@capacitor/clipboard` on native
- Haptics use `@capacitor/haptics` on native

**Deep links / invite links:**
- Invite links use `APP_BASE_URL` + `/invite?code=XXX`
- These will open in the user's default browser, NOT in the native app, unless Universal Links (iOS) / App Links (Android) are configured
- **No Universal Links configuration exists** — `apple-app-site-association` file not present
- Invite links will work (they open the web version) but won't open the native app

**Hardcoded URLs:** `APP_BASE_URL = 'https://spottedsocial.lovable.app'` — correct for production

**Potential breaking changes for iOS:**
1. **Universal Links not configured** — invite links won't open the native app
2. **Info.plist permissions** — Camera, Location, Photo Library descriptions must be added manually in Xcode
3. **Push notifications** — `@capacitor/push-notifications` is installed but Apple Push Notification service (APNs) configuration in Xcode is needed
4. **Mapbox** — requires adding `MGLMapboxAccessToken` to Info.plist or it may not render
5. **`capacitor.config.ts`** — the `server` block has been removed (per memory), so the app runs from local bundle — correct for production
6. **Safe area handling** — `Layout.tsx` uses `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` — correct
7. **Auth redirect flow** — OAuth callback goes to `https://spottedsocial.lovable.app/~oauth` which then needs to redirect back into the native app — this flow may need testing

**ISSUES FOUND:**
- No Universal Links / App Links configuration for deep linking
- Push notification APNs setup required in Xcode
- Mapbox access token needs to be in Info.plist for iOS
- OAuth redirect back into native app needs end-to-end testing

---

### AUDIT #6: Data Integrity & Edge Cases

**Two users check in at the same venue simultaneously:**
- No issue. Each creates their own `checkins` row and their own `night_statuses` upsert (keyed by `user_id`). No race condition.

**Can a user be checked in at two venues simultaneously:**
- No. `night_statuses` has a unique constraint on `user_id` (upserts use `onConflict: 'user_id'`). The check-in flow also explicitly ends previous active check-ins (`checkins.ended_at IS NULL` → sets `ended_at`). So only one active check-in at a time.

**User deletes account while checked in:**
- The `delete-account` edge function explicitly deletes from `checkins` and `night_statuses` tables. So yes, their status is cleared.
- However, it does NOT delete from: `invite_codes`, `invite_uses`, `daily_nudges`, `plan_votes`, `plan_downs`, `plan_participants`, `plans`, `review_votes`, `event_rsvps`, `event_logs`, `location_detection_logs`, `rate_limit_actions`, `venue_location_reports`, `dm_typing_indicators`
- **Orphaned data exists** after account deletion in these tables

**Can a user send messages to someone who blocked them:**
- The `dm_messages` INSERT policy only checks thread membership, not block status. If a thread already exists between two users and one blocks the other, **the blocked user can still send messages in that thread**. There is no block check on message send.
- The `blocked_users` table is only checked in `process_invite_code` (prevents friendship via invite).

**Group chat with a blocked member:**
- No block enforcement in group chats. All thread members can continue sending and reading messages regardless of blocks.

**Orphaned data scenarios:**
1. Posts referencing a deleted user: The `delete-account` function deletes posts, but `post_comments` and `post_likes` from OTHER users on those posts are deleted only by cascade if FK exists. The FK setup isn't visible, but comments/likes from other users on the deleted user's posts may become orphaned.
2. Friendship rows: `delete-account` deletes from `friendships` where `user_id = userId` AND `friend_id = userId` — this correctly cleans both directions.
3. DM threads: `dm_thread_members` is cleaned, but the `dm_threads` row itself is NOT deleted. Empty threads (0 members) will persist as orphans.
4. Plans: `plans` table is NOT in the deletion order — plans created by deleted users will orphan.
5. Venue reviews: Not in deletion order.

**ISSUES FOUND:**
- `delete-account` misses ~12 tables: `invite_codes`, `invite_uses`, `daily_nudges`, `plans`, `plan_votes`, `plan_downs`, `plan_participants`, `review_votes`, `event_rsvps`, `event_logs`, `location_detection_logs`, `rate_limit_actions`, `venue_location_reports`, `dm_typing_indicators`, `dm_threads`
- No block enforcement on message sending — blocked users can still message
- No block enforcement in group chats
- `dm_threads` rows orphan after account deletion
- `plans` and related data orphan after account deletion

---

### Summary of Critical Issues

| Priority | Issue | Impact |
|----------|-------|--------|
| HIGH | No realtime for map/check-ins — friends don't see updates live | Core feature broken |
| HIGH | No block enforcement on DM sending | Safety/harassment risk |
| HIGH | `delete-account` misses ~12 tables | Data leak / privacy risk |
| MEDIUM | Manual check-in has no GPS accuracy gate or proximity enforcement | Users can fake location |
| MEDIUM | Check-in flow has no transaction safety | Partial state on network failure |
| MEDIUM | `retry.ts` exists but is never used | All network failures are permanent |
| MEDIUM | No Universal Links for iOS deep linking | Invite links won't open native app |
| LOW | No server-side cron for expired real-user statuses | Stale data on client |
| LOW | No location permission prompt during onboarding | Jarring first check-in |
| LOW | Orphaned `dm_threads` after account deletion | Database clutter |

