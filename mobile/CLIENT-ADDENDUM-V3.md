# Developer Addendum v3 — Mobile Audit & Response

**Source:** `Spotted_Developer_Addendum_v3_Full_Recording_Parity.docx` · **Date:** Sept 17, 2026
**Branch:** `feature/react-native-migration` · **App:** React Native (Expo SDK 57), `mobile/`
**Companion:** `CLIENT-FEEDBACK-V2.md` (the 9-page brief). Sections 1–9 of that brief are done; §10–12 are still open.

Every item was checked against the current mobile code and, for parity items, against the original web build in `src/`. File references are `path:line` inside `mobile/src/` unless prefixed with `src/` (original build) or `supabase/`.

One note on wording: the addendum calls the rebuild "Swift". The app is React Native (Expo) with native iOS components underneath. Nothing below changes because of that, but the tracker should use the right name.

**Status legend**
- ✅ DONE — already behaves as requested
- 🟡 PARTIAL — exists but differs; the difference is described
- ❌ MISSING — not implemented
- ⛔ BLOCKED — needs something outside the code (a decision, an account, a reference file)
- ❓ QUESTION — needs a client decision before building

Estimates are developer-days for iOS.

---

## Summary

| Section | Headline | Est. (days) |
|---|---|---|
| 1. Social interactions | Friend card has Meet Up + Chat but the map opens it as a dialog, not the sheet; no relationship control; camera not restored. **No confetti, no "Invites Sent!" card, no Undo anywhere.** Invite picker is a flat list. Map lost wordmark, city badge, search bar, Friends chip and the "N friends out" roster. | 9 |
| 2. 5AM reset as one system | Server reset exists (SQL cron, per-city). Plans expire on the device clock, not the city. DMs and notifications have no read-time filter. Video assets on Mux are never deleted. Cron is an hour late in daylight time. | 3 |
| 3. 5AM copy placement | 10 strings exist across 7 files; 14 of the 18 placements in the table are missing (status sheets, Plans, meetups, invites, feed card, DMs, Activity, Settings, friend card). | 1.5 |
| 4. 5AM behaviour | Boundary timer exists but only refreshes 6 queries; the feed, DM thread, notifications and Yap keep last night's content until the user refreshes. Zero "This expired at 5am" screens; push taps land on blank lists. | 3 |
| 5. Morning After retention | No recap exists (v2 §11 unchanged). Copy already says "disappear", never "deleted". Decision needed before build. | ❓ |
| 8. WhatsApp regressions | 8.1 refresh loop fixed; 8.3 recenter fixed; 8.4 presence has two concrete causes found in code; 8.2 keyboard never dismissed on send anywhere; 8.6 push taps use web URLs the app cannot open; 8.5 vote count write is not atomic. | 7 |
| 9. Other requests | Brand pass done. Video autoplay done. Tag friends is net-new (both apps). Glowing S conflicts with the brand bible. | 5.5 (+2 onboarding) |
| 11. Recording parity | Plans, Yap, Activity, DM header, tab label and video: matched. Friends-out pill, search, profile "Change venue": needs work. Tab-bar S and flat favicon: intentionally different. | 4 |
| **Total** | | **~35 days** |

Suggested order follows §6 of the addendum: seeded demo account → §1/8.7 friend card + invites + confetti → §2/§4 reset behaviour → 8.4/8.6/8.2/8.5 device regressions → §3 copy → §11 parity → §9 P1s.

---

## 1. P0 — Restore original-build social interactions

### Friend card

**What works**
- One shared card body (`components/friend-id-card.tsx:117-232`): gradient-ringed avatar, name, `@venue` line that opens the venue, relationship badge, last-seen, "also here" avatars, overflow with Report/Block.
- **Meet Up and Chat are both present** (`friend-id-card.tsx:205-230`). Meet Up sends the request with the web's 5-minute dedupe (`lib/meet-up.ts:28-41`); Chat creates the DM thread and opens it.
- A `formSheet` version exists at `app/friend-card.tsx` and is what comments, likes, activity, search and post cards open.
- Privacy: venue and coordinates come from `get_profiles_safe` and the audience-filtered status queries; the card never widens access. ✅

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| Map pin → card over the map | 🟡 | The map opens a HeroUI `Dialog` (`map.tsx:738-760`), not the `/friend-card` sheet every other surface uses. Two presentations of one card; the dialog is the plainer one. Switch the map to the sheet. |
| Return to the same map position | ❌ | `handleFriendPress` flies to zoom 15 (`map.tsx:417-423`) and never restores. The save/restore mechanism already exists for venues (`map.tsx:372-401`); apply it to friends. |
| Chat → back returns to map context | 🟡 | Chat pushes `/thread` from the dialog; back lands on the map but the camera has moved (see above). |
| Relationship badge as a control (Close Friend ↔ Friend, Remove) | ❌ | Static text (`friend-id-card.tsx:151-175`). Original: chip + popover with tier switch and Remove Friend with undo (`src/components/FriendIdCard.tsx:1304-1390`). |
| Tonight status line variants | ❌ | Only `@venue` renders. Original shows "TBD tonight — thinking X", "In for the night", "Home" (`src/…/FriendIdCard.tsx:232-415`). |
| Mutual-friend context avatars / popover | ❌ | Missing for the mutual tier. |
| "Hide My Location" in overflow, distance line | ❌ | Missing. |
| Card and pin visually connected | ❌ | No selected-pin treatment. |
| Confetti on card open | ✅ | Correctly absent. |

### Invite flow and the "Invites Sent!" state

| Item | Status | Detail |
|---|---|---|
| Invite picker grouped "Friends Out Now" / "TBD Tonight" with venue per row | ❌ | The picker inside the venue sheet (`app/venue.tsx:448-519`) is a flat, ungrouped list of all friends, name only. Original groups by status with a status line per row (`src/components/InviteFriendsModal.tsx:150-252`). |
| Multi-select + "Send Invites (N)" | ✅ | `venue.tsx:470-515`. |
| "Invites Sent!" success card | ❌ | A system `Alert` (`venue.tsx:430-435`). Original: full-screen card with invitee names + venue, Undo, Chat (`src/components/VenueInviteConfirmation.tsx`). |
| Undo after sending | ❌ | **No undo path exists for invites or meet-ups.** The original's undo is a delete of the just-created notification rows; the RN send already has the ids. |
| Confetti on the success card | ❌ | No confetti or Lottie dependency in `mobile/` at all. The original fires `canvas-confetti` at six success moments (invite sent, meet-up sent, check-in, I'm Down, plan, event RSVP). |
| Meet Up confirmation card | ❌ | Also an `Alert` (`lib/meet-up.ts:69`). Same rebuild as the invite card. |
| `app/invite-friends.tsx` | — | This is the referral-link/QR screen, not the venue invite flow. Different feature, keep it. |

### Map should feel people-first

| Item | Status | Detail |
|---|---|---|
| Profile-photo pins with relationship rings | ✅ | `map.tsx:75-120`, same ring colours as the original. Numbered circles are used only for **venue** clusters, in both apps. |
| Numeric clustering only when needed | 🟡 | People cluster by same venue / 5 m (`map.tsx:47-48`, same algorithm as web). Venue clusters lack `clusterMaxZoom: 14`, so they persist at high zoom (original `src/pages/Map.tsx:1256`). |
| Venue pins distinct from people | 🟡 | Unclustered venues are a 6 px purple dot (`map.tsx:523-532`); the original draws a teardrop pin. |
| "Friends at [Venue]" intermediate list | 🟡 | Exists as a system `ActionSheetIOS` of names (`map.tsx:425-439`), no avatars. Original: anchored popover with avatars (`src/pages/Map.tsx:2102-2165`). |
| Close-friend pulse | 🟡 | Applied to every close-friend pin (`map.tsx:111-113`); the original pulses only the self marker. |

### Map shell (also §11.3)

| Original | RN | Status |
|---|---|---|
| "Spotted" wordmark + city badge on the map | Absent | ❌ |
| Search **bar** "Search people, venues…" | Icon button only | 🟡 |
| "Friends" filter chip | Folded into the filter sheet | ❌ |
| Bell, filter, my-location | Right-hand icon stack | ✅ |
| Out/venue status chip + Stop | Bottom pill + "Stop sharing" | ✅ (moved) |
| **"N friends out" expandable roster** | **Missing entirely** | ❌ |
| Relationship legend | Present, bottom-left | ✅ |

### Seeded demo account
`DEMO_MODE` exists in the mobile app (`lib/demo-mode.ts`) and the map, statuses and feed already branch on it. The seed itself is the existing edge function used by the web Demo Settings screen. Needs a pass to confirm the seed covers posts with media, Yaps, meet-ups, invites and DMs for the RN account. ~1 day, first in the order.

**Estimate:** friend card 3 · invite/meet-up success cards + confetti + undo + grouped picker 3 · map shell + roster 2 · pins/clusters 0.5 · demo seed 1 = **~9 days**

---

## 2. P0 — The 5AM reset as one system

**What works**
- One client definition: `lib/tonight.ts` computes 5 AM in the **profile city's** zone; `time-context.ts` re-exports it. Statuses, posts and Yaps stamp `expires_at` through it.
- Server-side enforcement exists: `public.nightly_reset()` (`supabase/migrations/20260916130000_party_locations.sql:100-190`) scheduled with pg_cron at 10:10 and 13:10 UTC. It clears the profile pin and `is_out`, ends check-ins, resets statuses to `home`, deletes posts, Yaps, plans, party locations, DMs (by sender's city) and notifications (by receiver's city). Every step is idempotent. ✅ "Do not rely on the phone clock."
- Per-city already: NYC and LA reset at their own 5 AM. ✅ "Architect around the market's time zone."
- Read-time filters mean expired statuses, posts, Yaps and plans hide even if the cron is late.
- Not reset: profile, friend graph, close friends, saved venues, audience preference. ✅ matches the "should NOT reset" list.

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| Plans expire on the **device** clock | ❌ | `lib/plans.ts:101-104` builds `new Date(y, m, d+1, 5, 0, 0)` in local time instead of `getNightResetIso(city)`. An NYC user in LA gets plans that live until 8 AM Eastern. One-line fix. |
| Meetups / invites have no expiry of their own | 🟡 | They are `notifications` rows (`meetup_request`, `venue_invite`); there is no meetups or invites table. They are deleted nightly by the server but never filtered at read time (`hooks/use-notifications.ts:81-86`), so a late cron shows last night's invites as actionable. Add a `created_at >= nightStart` filter. |
| DMs fetched unfiltered | 🟡 | `app/thread.tsx:210-215` and `lib/dm.ts:73-117` pull the whole history and drop old rows on the client. Works, but move the boundary into the query. |
| Cron is an hour late in daylight time | 🟡 | `'10 10 * * *'` / `'10 13 * * *'` are correct in standard time only (acknowledged in the migration comment). Schedule both 9:10/10:10 and 12:10/13:10 UTC (all idempotent), or compute in SQL. |
| **Mux video assets are never deleted** | ❌ | Mux deletion lives in the `daily-cleanup` edge function (`supabase/functions/daily-cleanup`), which the nightly_reset migration explicitly left as manual-only. The SQL reset deletes the post row and orphans the asset on Mux (billable storage). Fix: `nightly_reset()` writes expired `mux_asset_id`s to a queue table before deleting posts; a small edge function drains the queue, invoked by pg_cron via pg_net. |
| `events` and `stories` rows carry `expires_at` but no cleanup step | 🟡 | Harmless today (read-time filtered) but should be in the same function. |
| Two server implementations | 🟡 | `daily-cleanup` is Eastern-only and would delete LA users' still-current DMs if run by hand. Retire it once the Mux queue moves. |

**Estimate: ~3 days**

---

## 3. P0 — Exact 5AM copy by screen

Existing strings: `onboarding/welcome.tsx:42` ("disappear by 5am"), `check-in.tsx:752` ("Statuses reset at 5:00 AM {city} time", ask step only), home empty states (`(home)/index.tsx:159,179`), composer (`post-composer.tsx:212,413`), post-shared (`post-shared.tsx:133,180`), Yap tab (`messages.tsx:371` "resets 5am"), Yap thread (`yap-thread.tsx:312`). Wording is inconsistent ("5am" / "5 AM" / "5:00 AM {city}").

| Placement (addendum table) | Status | Where it goes |
|---|---|---|
| Onboarding card "Tonight resets at 5am." | 🟡 | `welcome.tsx` slide 4 has the idea; make it a dedicated card with the full body copy. |
| "Are you out tonight?" footer + info icon | 🟡 | Footer exists (`check-in.tsx:752`); no info icon / explanation sheet. |
| Yes → venue confirmation "Your status + shared spot clear at 5am." | ❌ | `check-in.tsx` confirm step. |
| TBD sheet "Your TBD status clears at 5am." | ❌ | `check-in.tsx` planning branch. |
| Active status on Map / Profile "Live until 5am" | ❌ | `map.tsx:660-714` pill; `profile.tsx:373-422` card. |
| Friend card "Shared for tonight · clears at 5am." | ❌ | `friend-id-card.tsx` under the venue line. |
| Plans header row | ❌ | `components/plans-feed.tsx` header. |
| Meetup composer "This meetup disappears at 5am." | ❌ | Meet Up is one tap (no composer). Put it on the confirmation card being built in §1. Plans composer: `components/plan-form.tsx` above Create. |
| Meetup / invite cards "Expires at 5am." + toasts | ❌ | `app/activity.tsx` rows; success cards in §1. |
| Send Invite "This invite disappears at 5am." | ❌ | Venue invite picker above Send. |
| Post preview clock + "Disappears at 5am." | 🟡 | `post-composer.tsx:413` is a footer paragraph; the addendum wants it beside the audience/venue row above Share. |
| Feed card "Tonight · until 5am" | ❌ | `components/post-card.tsx` meta line. |
| Yap "Tonight's Yap · clears at 5am." | 🟡 | Present as "resets 5am"; align wording; add the one-time longer explanation. |
| DM thread "Tonight only · messages clear at 5am." | ❌ | `app/thread.tsx` header subtitle. |
| New chat / empty DM "Messages sent here clear at 5am." | ❌ | `app/thread.tsx` empty state. |
| Notifications "Expires 5am." + expired push state | ❌ | See §4. |
| Morning After "Last night reset at 5am." | ⛔ | No recap screen exists (§5). |
| Settings "5AM Reset" row | ❌ | `(profile)/settings.tsx`. |

Copy standard to adopt everywhere: **"5am"** lowercase as in the addendum, city suffix only on the status sheet.

**Estimate: ~1.5 days** (after §1 cards exist)

---

## 4. P0 — 5AM behaviour, not just copy

| Requirement | Status | Detail |
|---|---|---|
| Objects created at 4:59 expire at 5:00 | ✅ | Every `expires_at` is the next 5 AM, never +24 h (`tonight.ts`, `lib/night-status.ts:75-80`, `lib/posts.ts:8-10`). Plans excepted (§2). |
| App open at 5 AM updates without force quit | 🟡 | A boundary timer fires (`components/night-status-gate.tsx:126-134`) but only invalidates six react-query keys (`hooks/use-own-night-status.ts:14-21`). **Not** refreshed: the feed (plain `useState`, `hooks/use-feed.ts:59-66`), the open DM thread, notifications, Yap directory and thread. They show last night until the user pulls to refresh. Fix: one `onNightBoundary()` that also clears feed state, DM/Yap/notification queries and the map. |
| Backgrounded / offline through 5 AM → reconcile on foreground | ✅ | `focusManager` is wired to AppState (`lib/query-client.ts:7-9`); own status uses `staleTime: 0`; there is **no persisted query cache**, so nothing stale survives a cold start. Feed still needs the boundary hook above for warm foregrounds. |
| Live location session ends at reset | ✅ | Three layers: `endNightLocally` on next open (`use-own-night-status.ts:49-55`), the watcher self-stops on its next fix (`lib/background-location.ts:51-56`), server clears the pin, and readers hide any pin not from tonight. |
| Deep links / push taps to expired content → "This expired at 5am" | ❌ | No such state anywhere. Comments (`app/comments.tsx:50`), likes, Yap thread and DM thread all render an **empty list** when the row is gone. There is no plan-detail route, so a plan invite has nowhere to land beyond Activity. |
| No expired previews in cached UI | ✅ | Memory-only cache; DM previews and post thumbnails are filtered by `isFromTonight` / `expires_at` at read time. |
| Cross-city skew | 🟡 | A notification is deleted by the receiver's city, the post by the author's. An NYC→LA tap between 5 AM ET and 5 AM PT hits a deleted post. The expired-state screen covers it. |

**Estimate: ~3 days** (boundary refresh 1, expired-state screens + plan route 1.5, push URL fix in 8.6)

---

## 5. P0 clarification — Morning After vs "everything disappears"

- Current copy already says "disappear" / "gone" / "resets"; **"deleted" appears nowhere** in user-facing strings. ✅
- No Morning After recap exists in the RN app (v2 §11 status unchanged: only a 10 AM local notification pointing at Activity). Nothing to reconcile yet.
- DMs, meet-ups and invites are hard-deleted nightly, so they can never leak into a recap. Posts and Yaps are also deleted, which means a recap that shows "your own photos" would need a separate private copy made **before** the reset (a `night_recaps` table populated by `nightly_reset()` from the user's own posts, with the image kept in a private bucket path).

❓ **Decision needed:** (a) recap retains the user's own photos/Yaps as a disclosed private exception, or (b) recap is stats only. (a) is ~8 days (v2 estimate) plus the retention copy in the 5AM Reset explanation; (b) is ~3 days. Neither should start before the P0 fixes.

---

## 8. P0 — WhatsApp QA regressions

### 8.1 Refresh loop — ✅ Fixed
Commits `d1eb467` and `40d2966`. Realtime channels get a fresh topic per attempt, the old channel is detached before leave, and retry is cancelled on `SUBSCRIBED` (`lib/resilient-channel.ts:63-98`). The feed refresh is single-flight with a queued flag and a `finally` that always clears the spinner (`hooks/use-feed.ts:158-193`); its effects key on the user id, not the session object.

Residual: Leaderboard, Friends and Profile drive their `RefreshControl` from react-query's `isRefetching` (`leaderboard.tsx:375`, `friends.tsx:262`, `profile.tsx:245`), so a realtime invalidation flashes a spinner nobody pulled. Not a loop, but it looks like one on a busy night. Messages already avoids this (`messages.tsx:225-230`). Apply the same wrapper. **0.5 day**

### 8.2 Keyboard stays open — ❌ Not addressed
`Keyboard.dismiss()` is called in exactly two places in the app, both in the plan form's friend picker. **No composer dismisses on send:** comments (`app/comments.tsx:95-109`), DM (`app/thread.tsx:352`), Yap (`app/yap-thread.tsx:207-241`). Comments and Yap lists have no `keyboardShouldPersistTaps`, so a like/vote tap while typing needs two taps. `app/edit-profile.tsx` has no keyboard-aware container at all, so its inputs and Save can sit under the keyboard. `app/search.tsx:77` `autoFocus` reopens the keyboard every time the modal is returned to. **1 day**

### 8.3 Recenter goes to the wrong place — ✅ Fixed (v2 §6)
Recenter now uses a one-shot `getCurrentPosition()` (never prompts), keeps the current zoom and touches no filter, status or audience (`map.tsx`, `lib/background-location.ts:157-171`). If no fix is available the button is a no-op; add a small "Turn on location" toast for the denied case. **0.2 day**

### 8.4 Friend presence / map sync — ❌ Two causes found in code
1. **Pins require a location fix under two hours old.** `hooks/use-map-data.ts:63-70` shows a friend only when `isFreshLocation(last_location_at)` (tonight and < 2 h, `lib/tonight.ts:149-154`). The background watcher writes a fix only after 100 m of movement (`lib/location-ready.ts:78`, `stopTimeout: 5`), and with When-In-Use permission it writes nothing once the phone is locked. A friend standing in a venue with a locked phone therefore **vanishes after two hours while still checked in.** Fix: treat an open check-in as presence; use `last_location_at` only for the fade (15 min) and for moving the pin, not for existence; add a periodic heartbeat write while out (foreground timer + the plugin's heartbeat).
2. **The map never hears about location writes.** Its realtime channel subscribes to `night_statuses` only (`use-map-data.ts:284-300`). The friend's first pin is a `profiles` update, so the viewer's map waits for the 30 s stale window or a tab focus. That is the "appeared only after a delay". Fix: subscribe to `profiles` updates for friend ids (or a lightweight `presence` broadcast) and invalidate.
3. Both users disappearing later is consistent with (1) once both were stationary for two hours.

Also verify on device that the Always prompt is actually granted in the tester flow; When-In-Use alone cannot keep a pin moving in the background. **2 days + two-device test**

### 8.5 Yap upvote count — 🟡 Partial
Optimistic update, unique `(yap_id, user_id)` constraint, realtime refetch on `yap_messages` changes and cascade delete at reset are all in place (`lib/yap.ts:172-215`, `yap-thread.tsx:180-197`). The defect: the vote row and the `increment_yap_score` RPC are two separate requests and the RPC's error is discarded (`yap.ts:211`), so a dropped connection between them leaves the vote saved with the count unchanged, permanently. No in-flight guard on the button. Fix: one `vote_on_yap(yap_id, vote_type)` RPC that writes both in a transaction and returns the new score; disable the button while in flight. Same non-atomic pattern on comment counts (`yap.ts:262-273`). **0.5 day**

### 8.6 Push notifications — 🟡 Partial, one high-impact bug
Registration uses a raw APNs device token stored on `profiles` (`components/push-notification-manager.tsx:42-60`); `send-push` talks to APNs directly and covers all 20 categories including dm, meetup, invite, friend request and arrival.

- **Tap destinations are web routes.** `supabase/functions/send-push/index.ts:652-687` sends `/messages?tab=activity`, `/profile/friend-requests`, `/feed`, `/?checkin=true`. The RN handler pushes whatever starts with `/` (`push-notification-manager.tsx:79`), so most taps land on an unmatched route. Fix: map types to RN routes on the client (`/activity`, `/thread?id=`, `/check-in`), ignore the server url. **0.5 day**
- **Denied at OS level → silent.** Permission failure is swallowed (`:36-40, :61-63`); the Settings row is display-only (`settings.tsx:138-142`). Add the `Linking.openSettings()` path the app already uses for location and contacts. **0.3 day**
- **`aps-environment` is not in `app.json`.** The entitlement only exists in the gitignored `ios/` folder (set to `development`). Add `ios.entitlements` so a clean prebuild / EAS build gets it, and confirm `APNS_SANDBOX` matches the build. **0.2 day**
- Sends are client-invoked (`supabase.functions.invoke('send-push')` from the sender's device), never DB-triggered, so a push only goes out if the sender's app completed the call. Acceptable for beta; note it in the tracker.
- Expired-content taps: covered by §4's expired screen.
Physical-device verification of the whole path is still required. **1.5 days total incl. device test**

### 8.7 Friend card + invite success — ❌ See §1.

### 8.8 Branded dropdown replaced — 🟡 Needs the screenshot to confirm
The audience selector was **not** a dropdown in the original (radio rows, `src/components/CheckInModal.tsx:1080-1120`); the RN `/audience` sheet with the "Visible to X ▾" row follows the 9-page brief. The control that matches "was a dropdown before in the Spotted format" is the **Leaderboard neighborhood filter**: the original was a branded pill + Spotted-styled menu (`src/pages/Leaderboard.tsx:612-636`); RN keeps the pill but opens a system `ActionSheetIOS` (`leaderboard.tsx:347-357`). Second candidate: the Profile "Recent Spots / Wishlist / Your Posts" title dropdown (`src/pages/Profile.tsx:704-718`), which RN replaced with tap-to-cycle. Both get a branded menu sheet. ⛔ Confirm which one the Sept 15 screenshot shows. **0.5 day**

### 8.9 Microphone icon — 🟡
No voice feature exists. The mic is the Yap brand glyph: decorative in the Yap directory empty state (same as the original, `src/components/messages/YapTab.tsx:401`) and, more confusingly, in the **Yap thread header** next to "Anonymous · resets 5am" (`yap-thread.tsx:314`) where it reads as a record button that does nothing. Remove it from the thread header. The mic in the camera permission list is real (video sound). **0.1 day**

### 8.10 External OTP / Twilio — ⛔ Blocked on the Twilio account, plus small UX work
The app itself has no hard-coded numbers; the ten `1555000000x` test numbers live in `supabase/config.toml:45-55` and only apply when pushed to the project. Real users go through Twilio. The auth screen carries a note that Twilio was suspended and the email fallback is hidden (`auth/index.tsx:169-182`), so **until Twilio is confirmed active in the dashboard, no new external user can sign up.** Cannot be verified from code.
UX gaps on `auth/otp.tsx`: raw Supabase error strings shown verbatim, no rate-limit (429) message, wrong code is not cleared and can be resubmitted. Resend with 30 s cooldown works. **0.5 day + Twilio dashboard check**

---

## 9. P1 — Other WhatsApp requests

| Item | Status | Detail |
|---|---|---|
| 9.1 Brand colour consistency | ✅ | Brand pass committed `e1cfea3`: tokens in `lib/theme.ts`, no per-screen colours, lime + violet only, Action Violet for white-on-violet fills, native tab colours. Open question from that pass still stands: the bible's hex values were sampled from this app. |
| 9.2 Elevated onboarding | ⛔ | `onboarding/welcome.tsx` already has the four education slides including the 5am one, plus name / username / city. Missing vs the original: permission-denied recovery, find-friends step, sample avatars. The Sept 15 WhatsApp reference is not in the repo; need it before designing. **2 days** once received. |
| 9.3 Tag friends in posts | ❌ New | No tagging in either app or any migration. Needs a `post_tags` table (RLS: post audience), composer picker after media, tags on the card, tap → friend card, `post_tag` notification type, cascade delete with the post. **3 days** |
| 9.4 Feed videos start immediately | ✅ | `PostVideo` autoplays muted when ≥50 % visible and pauses off-screen (`components/post-card.tsx:23-56`, `(home)/index.tsx:333-346`); Mux HLS with a poster until `readyToPlay`. Optional: preload the next video player one card ahead. **0.5 day** |
| 9.5 Glowing S favicon | ❓ | The brand bible (Sept 2026) specifies the flat S and calls the old glowing PNG "pure yellow, not lime"; the app now uses the flat vector everywhere. The web build still ships the glowing PNGs. Client must pick one; if glowing, it should be a new asset in lime. |

---

## 11. Recording-to-recording parity

| # | Item | Verdict | Detail |
|---|---|---|---|
| 11.1 | Home friends-out pill "16 out · 5 TBD" | **Needs work** | No pill. The roster (`OutTonightCard`, `(home)/index.tsx:40-134`) renders only inside `ListEmptyComponent`, so it disappears once one post exists; the banner shows only to TBD viewers. `hooks/use-friends-out.ts` already returns the data with realtime. Add the persistent pill + roster sheet grouped by ring. **1 day** |
| 11.1 | Floating lime "+" separated from feed | Matched | FAB labelled Post / Plan. |
| 11.1 | Populated-card comparison | Blocked on seed | Compare after the demo seed. |
| 11.2 | Plans event cards, EVENT badge, "I'm Down" | **Matched** | `components/plans-feed.tsx`, `event-card.tsx:85-186`, `plan-card.tsx:290-299`. Status strip is a separate layer above the cards, as requested. (`plan_attendees` does not exist; the relation is `plan_votes` / `event_rsvps`.) |
| 11.3 | Map shell | **Needs work** | See §1 map shell table. |
| 11.4 | Map people interactions | **Needs work** | See §1 pins/friend card. |
| 11.5 | Venue card | **Matched** (one gap) | Compact sheet with Invite Friends Here, Directions, Share, Save, More Info, "Be the first spotted here tonight", who's-here first (`app/venue.tsx`). Missing: the **Yap** shortcut (`src/components/VenueIdCard.tsx:791-796`). **0.2 day** |
| 11.6 | Invite Friends flow + success | **Needs work** | See §1. |
| 11.7 | Search | **Needs work** | RN searches people + venue names only (`app/search.tsx`). Missing: neighborhood matching, People/Venues toggle, "Trending Tonight", "Friends Out Now" (`src/components/UnifiedSearch.tsx`). **1.5 days** |
| 11.8 | Yap density / Hot-New | **Matched** | `messages.tsx:100-134, 351-368`, `yap-thread.tsx`. |
| 11.8 | "DMs" vs "Messages" label | **Fixed** | The bottom tab says **Chat** in both builds. The toggle inside it said "DMs" in the original (`src/pages/Messages.tsx:92`) and "Messages" here; changed to **DMs** (`messages.tsx`). |
| 11.8 | DM header with venue in lime | **Matched** | `app/thread.tsx:582-631`: lime `@venue` when visible, "N members" for groups, `@username` only as a fallback (an addition, not a regression). |
| 11.8 | Composer camera affordance | Needs work (minor) | RN offers the photo library; the Spotted camera is not wired into the DM composer. **0.5 day** |
| 11.9 | Activity screen | **Matched** | Reachable from the bell on every tab; Friends Planning with "Make plans", Invites with "I'm down!", Messages with "View", accepted invites with Chat (`app/activity.tsx:230-389`). Gap: "View" opens the Messages list, not the thread. Notification rows lack a read-time expiry filter (§2). **0.2 day** |
| 11.10 | Profile "Change venue" | **Needs work** | Only "Update status" / "Stop sharing" (`profile.tsx:405-421`). Add a "Change venue" action for users who are out that opens the check-in sheet at the venue step. Spots view cycles on tap instead of a labelled picker (ties to 8.8). **0.5 day** |
| 11.10 | Audience labels | Matched | Close Friends / Friends / Friends + Mutuals everywhere. |
| 11.11 | Bottom nav S as Profile | **Intentionally different** | v2 §6 asked that the bare S stop secretly opening the status flow, so the S now lives in the header `StatusPill` with the user's answer and Profile uses a person icon (`(tabs)/_layout.tsx`). Native iOS tabs cannot carry a custom raster S. ❓ If the client wants the S back in the tab bar as Profile, it can be an SF-symbol-style template image at the cost of the lime glow. |
| 11.11 | Capsule tab background | Intentionally different | Native iOS 26 tab bar; the system draws the material. Content padding keeps the FAB and last rows clear (v2 §9). |
| 11.12 | Not regressions | — | Agreed: city badge, empty screens, leaderboard. |

---

## Reply for the client (the format requested in §7, §8–10 and §11)

**§1–7 P0 status**
- Already implemented: Meet Up + Chat on the friend card; people-first avatar pins with relationship rings; venue sheet with Invite Friends Here / Directions / Share / Save / More Info; server-enforced per-city 5 AM reset covering status, location, check-ins, posts, Yaps, plans, DMs, notifications; objects created at 4:59 expire at 5:00; foreground reconciliation; no persisted cache; live-location stops at reset; "disappears" wording.
- Not yet: map opens the card as a dialog and loses the camera; relationship control, status variants, hide-location on the card; "Invites Sent!" / Meet Up confirmation cards, Undo, confetti; grouped invite picker; map wordmark / city badge / search bar / Friends chip / "N friends out" roster; plans expiry on device clock; Mux assets never deleted; open-app boundary refresh for feed/DMs/notifications/Yap; "This expired at 5am" screens; 14 of 18 copy placements; Settings "5AM Reset" row; seeded RN demo account check.
- Blockers: Morning After retention decision (§5); the branded-dropdown screenshot (8.8); the onboarding reference (9.2); Twilio account state (8.10).
- Order: demo seed → friend card + invite/meet-up success cards → reset behaviour + Mux + expired screens → 8.4 presence, 8.6 push, 8.2 keyboard, 8.5 votes → 5am copy → §11 parity → 9.3 tagging.

**§8–10**
| Item | Status |
|---|---|
| 8.1 Refresh loop | Fixed (spinner cleanup on 3 tabs in progress) |
| 8.2 Keyboard | Not started |
| 8.3 Recenter | Fixed |
| 8.4 Presence sync | Not started — root causes identified |
| 8.5 Yap upvote | Not started — root cause identified |
| 8.6 Push | Not started — tap routing bug identified; device test pending |
| 8.7 Friend card + invite success | Not started |
| 8.8 Branded dropdown | Blocked — need the Sept 15 screenshot |
| 8.9 Mic icon | Not started (remove from Yap header) |
| 8.10 OTP / Twilio | Blocked — Twilio account; UX polish not started |
| 9.1 Brand colours | Fixed |
| 9.2 Onboarding | Blocked — need the reference |
| 9.3 Tag friends | Not started (new feature) |
| 9.4 Video autoplay | Fixed |
| 9.5 Glowing S | Blocked — conflicts with the brand bible |

**§11 by item:** 11.1 Needs work · 11.2 Matched · 11.3 Needs work · 11.4 Needs work · 11.5 Matched (add Yap shortcut) · 11.6 Needs work · 11.7 Needs work · 11.8 Matched, "DMs" label restored (composer camera: needs work) · 11.9 Matched (View → thread) · 11.10 Needs work (Change venue) · 11.11 Intentionally different (S moved to header per v2 §6; native tab bar) · 11.12 Agreed.

---

## Decisions needed from the client

1. **Morning After retention:** private recap with own photos/Yaps (disclosed exception) or stats only.
2. **Which control is the "Spotted dropdown"** in the Sept 15 screenshot: Leaderboard neighborhood filter or Profile spots switcher.
3. **Glowing S vs flat S:** the brand bible specifies flat lime; the request asks for the glowing asset.
4. **S in the tab bar:** keep the header StatusPill (v2 §6 decision) or restore the S as the Profile tab.
5. Still open from v2: "Status" vs "Set status" on the pill; bible hex adoption; larger type scale.

## Not in scope of this document, still pending
- v2 §10 comment composer sheet, §12 device verification.
- Rotate the Mux token and webhook secret (they passed through chat).
- Twelve local commits on `feature/react-native-migration` are unpushed.
