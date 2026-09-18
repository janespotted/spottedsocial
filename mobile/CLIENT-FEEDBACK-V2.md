# Client Feedback v2 — Mobile Audit & Response

**Source:** `Spotted_App_Changes_Revised_v2.docx` · **Date:** Sept 15, 2026
**Branch:** `feature/react-native-migration` · **App:** React Native (Expo SDK 57), `mobile/`

Every item below was checked against the current mobile code, not the web app. File references are `path:line` inside `mobile/src/`.

**Status legend**
- ✅ WORKS — already behaves as requested
- 🟡 PARTIAL — exists but differs; the difference is described
- ❌ MISSING — not implemented
- 🔍 VERIFIED — client marked it "verify"; tested/traced, result stated
- ❓ QUESTION — needs a client decision before building

Estimates are developer-days for iOS. Android is not included (see Questions at the end).

---

## Summary

| Section | Headline | Est. (days) |
|---|---|---|
| 1. Opening status prompt | No launch gate exists. Status entry is still the "Go Live" sheet with I'm Out / Planning Tonight / Private Party / Staying In. Largest rebuild. | 6 |
| 2. Audience & status controls | Labels still "All Friends" / "Mutual Friends". Side-by-side pills everywhere. Defaults differ per screen; post audience never remembered. | 3 |
| 3. Location permissions | Yes never writes status before share (good), but GPS/Motion prompts fire on Yes, and a failed background watcher shows "Could not check in". | 2 |
| 4. Camera | No in-app camera. System camera via expo-image-picker; form opens before media. Full rebuild. | 5 |
| 5. Post preview & sharing | Venue autofill works; missing discard guard, retry, success state, proper audience sheet, remembered audience. | 2.5 |
| 6. Button labels | Mostly one-line string fixes. Recenter button is a real bug (recenters on city, forces zoom 13). | 1.5 |
| 7. Map & venue | Filter isolation from sharing **verified clean**. People/venue filter mixing confirmed. Venue is a full modal, not a sheet. | 3 |
| 8. Empty states | Plans "Nobody's out yet" bug confirmed. No friend-count branching anywhere. | 2 |
| 9. Leaderboard & layout | Biggest Mover overlay, "1 spots", contrast, no Dynamic Type, transparent sheets: all confirmed. | 3 |
| 10. Comment composer | Full-screen modal. Keyboard docking already correct. | 1.5 |
| 11. Morning After Debrief | Only a 10am local notification pointing at the generic activity inbox. No recap exists. New feature. | 8 |
| 12. Verification | Device test pass across two accounts. | 3 |
| **Total** | | **~40 days** |

Suggested order (matches the client's stated priorities): §1 → §2 → §3 → §4 → §5 → §10 → §6/§7/§8/§9 → §11 → §12.

---

## 1. Required opening status prompt

**What works**
- The check-in flow is already a native bottom `formSheet` that slides up (`app/_layout.tsx:95-103`). The presentation primitive the client wants exists.
- Tapping "I'm Out" writes nothing to the database. It only runs venue detection (`app/check-in.tsx:190-193`). The `night_statuses` upsert and `checkins` insert happen only on the final CTA (`check-in.tsx:271-281`, `lib/night-status.ts:231-291`). ✅ "Yes alone must not mark them checked in."
- Private Party never creates a public venue: `venue_id: null`, free-text name (`check-in.tsx:317`), and `party_address` is kept out of every upsert.

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| "Are you out tonight?" gate on launch | ❌ | No gate anywhere. `app/_layout.tsx:31-135` only guards auth/onboarding. Tabs render unconditionally. |
| Non-dismissible modal sheet | ❌ | Current sheet has `sheetGrabberVisible: true` and swipe-dismiss (`_layout.tsx:99-100`). |
| No Skip / "Remind me later" | ❌ | A "Remind me later" affordance exists today (`check-in.tsx:382-388`). Will be removed. |
| Re-ask on reopen; notifications/links must not bypass | ❌ | Push deep links route straight into the app (`components/push-notification-manager.tsx`). No "answered tonight" record exists in AsyncStorage or the profile. |
| Yes → "Looks like you're at [Venue]?" | 🟡 | Copy is close (`check-in.tsx:423-434`) but the CTA is "Go Live", there is no "Not here" secondary, and the nearby-venue list + search are always visible instead of hidden behind "Not here" (`check-in.tsx:436-495`). |
| Compact "Visible to Friends ▾" row | ❌ | Forced 3-up pill picker under "Who can see you" (`check-in.tsx:75-110`). |
| Immediate payoff ("You're out. 4 friends are nearby") | ❌ | `goLive()` just calls `router.back()` (`check-in.tsx:302`). |
| Private Party as a location type inside Yes | ❌ | It is a top-level fourth status (`check-in.tsx:51`). |
| TBD: "Thinking about going out?" / "Share TBD status" | 🟡 | Title "Planning tonight", CTA "I'm Planning Tonight" (`check-in.tsx:592`, `:668`). |
| TBD must not require location | ❌ | Choosing Planning immediately requests GPS to detect neighborhood (`check-in.tsx:200`, `lib/location-service.ts:159-175`). |
| TBD social proof after sharing | ❌ | Nothing shown. |
| No: save and enter app immediately | 🟡 | "Staying In" writes `status: 'home'` with `expires_at: null` (`lib/night-status.ts:196-201`). Every reader treats null expiry as "no status", so **No is indistinguishable from never answered**. This alone blocks "don't re-ask tonight". |
| No: gate precise pins, show aggregate cues + CTA | ❌ | `hooks/use-map-data.ts:55-100` never reads the viewer's own status. |
| Go back within setup | ❌ | Step state is forward-only (`check-in.tsx:123, 190-215`). |
| One definition of "tonight" | 🟡 | Three implementations: statuses use 5am in the **profile city's** time zone (`lib/night-status.ts:55-98`); posts use 5am **device-local** (`lib/posts.ts:8-13`); feed/pin freshness uses device-local `getHours()` (`lib/time-context.ts:7-13`). They agree only when device and profile city match. |
| Auto-expiry at reset | 🟡 | Expiry is enforced only by read-time filters. `checkins.ended_at` is set only on explicit user action. `profiles.is_out` is never cleared at 5am client-side. Depends on the `daily-cleanup` edge function cron, which needs dashboard verification. |

**Plan:** add a `NightStatusGate` provider above the tabs that resolves "answered tonight" from `night_statuses` (row with `expires_at > now`, including a `home` row with a real expiry). Rebuild the sheet as Yes/TBD/No with the sub-flows described. Unify "tonight" on one helper used by statuses, posts, and freshness. Remove "Remind me later".

**Questions**
- ❓ Reset time: keep **5:00 AM in the user's profile-city time zone** (NYC/LA) for everything? That is what statuses already use. Posts would change from device-local to match.
- ❓ Should "No" be re-askable the next night only, or also after the user changes city/travels? Proposed: per night, per profile city.

**Estimate:** 6 days.

---

## 2. Audience selection and status controls

**What works**
- The three-tier data model already exists end to end (`close_friends` / `all_friends` / `mutual_friends`) and is enforced server-side by `can_see_location`. Only labels and presentation change.
- Status audience persists to `profiles.location_sharing_level` (`check-in.tsx:283`).
- Map, Plans, and arrival prompts share one query key and refresh via realtime.

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| Labels: Close Friends / Friends / Friends + Mutuals | 🟡 | "All Friends" / "Mutual Friends" in `check-in.tsx:39-40`, `profile.tsx:25-32`, `create-post.tsx:33-34`. String change. |
| Descriptions under each label | 🟡 | Only the post action sheet has descriptions. |
| "Who can see this?" bottom sheet, stacked rows, checkmark, "Confirm audience" | ❌ | Status uses inline pills; posts use an iOS `ActionSheetIOS` (`create-post.tsx:106-118`). One shared `formSheet` route will replace both. |
| Default = Friends for new users | 🟡 | Three different defaults: check-in sheet `close_friends` (`check-in.tsx:124`), profile `all_friends`, posts `all_friends`. |
| Remember explicit choice, never broaden | 🟡 | The check-in sheet never reads the saved level back; it resets to Close Friends every open and then overwrites the profile on share. Post audience is never persisted. |
| Tell user if audience is empty | ❌ | No check. |
| Replace "Go Live" menu | ❌ | "Go Live" sheet title, CTA, and map pill (`check-in.tsx:364, 508`, `map.tsx:620`). |
| "Update status" / "Share my spot" / "Share TBD status" | ❌ | Currently "Change status", "Go Live", "I'm Planning Tonight", "Start the Party". |
| Confirming audience must not publish | 🟡 | On the Profile card, tapping an audience pill writes immediately (`profile.tsx:180-199`). |
| Status card: status / venue / audience + Update + Stop sharing | 🟡 | Card exists (`profile.tsx:375-464`) but has no Stop sharing action and shows the pill picker instead of a compact row. |
| Stop sharing ≠ No | 🟡 | Map "Stop", Plans "Staying In", and sheet "Staying In" all call the same `stopSharing()` and write the same row. Will split: Stop sharing keeps status but hides location; No records `home` for the night. |
| Private Party honors "exact spot for Close Friends only" | 🟡 | Copy promises close-friends-only (`check-in.tsx:569-572`) but exact coords are shown to close **and** direct friends (`use-map-data.ts:144-150`). Either the copy or the rule must change. |
| Status sync across Plans / Profile / Map | 🟡 | Profile uses a separate query key that check-in and Map Stop never invalidate, so Profile goes stale. |
| Plans "Out" segment | ❌ | Shows an alert "Checking in at a venue is coming to the app next" (`components/plans-feed.tsx:111-114`). Will open the status flow. |

**Questions**
- ❓ Private Party: should the exact spot go to **Close Friends only** (matching the copy) or **Friends** (matching current behavior)? Recommend Close Friends only.

**Estimate:** 3 days.

---

## 3. Location permissions

**What works**
- Yes does not write status (see §1). ✅
- GPS failure that is not a hard denial falls through to manual venue search (`check-in.tsx:181-186`). ✅
- Map pins are freshness-gated (tonight and < 2h) and dropped after 60 min (`use-map-data.ts:64`, `map.tsx:270`). ✅

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| Explain permissions before requesting | 🟡 | Only the onboarding slide. At check-in time, `ensureLocationReady()` configures **Always** + motion activity (`lib/location-ready.ts:45-59`), so iOS shows Motion & Fitness then the background-location upgrade with no in-app explanation. This is the sequence in the client's recording. |
| Don't look Out before share | 🟡 | DB is correct, but the permission cascade fires on Yes, and `profiles.is_out` is never reset at 5am so a stale card can read Out. |
| Distinguish check-in success from background availability | ❌ | `goLive()` awaits the watcher start (`check-in.tsx:284`); any throw shows "Could not check in. Try again." even after the status/checkin writes succeeded (`check-in.tsx:303-304`). Watcher failures are otherwise swallowed (`lib/background-location.ts:171-173`). |
| Recheck on return from Settings | ❌ | `Linking.openSettings()` with no AppState listener (`check-in.tsx:411`). |
| On denial, explain what still works + next step | 🟡 | Denied screen offers only Open Settings, no venue search (`check-in.tsx:400-418`). |
| Old check-in must not look fresh | 🟡 | Pins OK; Profile status card has no freshness check (`profile.tsx:78-83`). |

**Plan:** request When-In-Use on Yes with a one-line explainer, defer the Always upgrade until after "Share my spot" succeeds and show it as a separate "automatic updates" step; separate the check-in write from the watcher start and message each; AppState listener to re-check permission on foreground; add venue search to the denied branch.

**Estimate:** 2 days.

---

## 4. Camera and capture flow

**What works**
- Nothing on this list. The upload path (`lib/posts.ts`) and venue autofill are reusable.

**What needs changing**

The client's description is exactly the current behavior. The "+" opens `/create-post` as a form with Camera/Library tiles, caption, venue, and audience before any media exists (`app/create-post.tsx:192-318`). "Camera" calls `ImagePicker.launchCameraAsync` (`create-post.tsx:46`), the system camera. There is no `expo-camera` or `react-native-vision-camera` in `package.json`.

| Item | Status |
|---|---|
| Full-screen in-app camera preview | ❌ |
| Tap for photo | ❌ |
| Hold to record, release to stop | ❌ |
| Recording indicator + timer + max duration | ❌ (a 14s cap is passed to the OS picker only) |
| Double-tap to flip | ❌ |
| Visible flip button | ❌ |
| Library thumbnail bottom-left | ❌ |
| Flash control | ❌ |
| Clear close button | 🟡 (form header only) |
| No caption/venue/audience on camera screen | ❌ |
| Camera denied → library still works | ❌ No permission handling at all; denial is treated as cancel. |
| Mic denied → explain, don't block photos | ❌ `app.json` has no `NSMicrophoneUsageDescription`. |

**Plan:** new `/camera` full-screen route on `expo-camera` (native module, requires an iOS rebuild): tap/hold capture, 14s timer ring, double-tap + button flip, flash, last-library-item thumbnail, close. Add microphone usage string. Then push to `/create-post` in preview mode.

**Questions**
- ❓ **Flip during recording:** `expo-camera` cannot switch lenses mid-recording; the recording stops. Recommend shipping double-tap flip before capture first, as the client suggested, and revisiting with `react-native-vision-camera` later if needed.
- ❓ Text-only posts are possible today (`create-post.tsx:155-158`). Keep a text-only path, or is every post media-first?

**Estimate:** 5 days.

---

## 5. Post preview and sharing

**What works**
- Suggests the current checked-in venue (`create-post.tsx:85-104`). ✅
- Venue can be changed or removed via free text + autocomplete. ✅
- Duplicate taps prevented (`create-post.tsx:147, 200`). ✅
- Draft state survives removing media. ✅
- Posts expire at 5am (`lib/posts.ts:8-13`). ✅

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| Large preview with video playback | 🟡 | Capped at 380pt inside a scroll; video is muted, looping, no controls (`create-post.tsx:60-67, 190`). |
| Retake / Replace | 🟡 | Only an unlabeled "x" that clears media. |
| "Changing post venue doesn't move your check-in" copy | ❌ | |
| Audience labels + "Who can see this?" sheet | 🟡 | See §2. |
| Remember last post audience, never broaden | ❌ | Hardcoded `'all_friends'` every open (`create-post.tsx:78`). Will persist separately from status audience. |
| Confirm before discarding populated draft | ❌ | Close is a bare `router.back()`; iOS swipe-dismiss bypasses everything. |
| Upload progress | 🟡 | Spinner only; upload buffers the whole file with no progress events. |
| Retry on failure | 🟡 | Draft preserved, but only a raw error string, no Retry button. |
| Success confirmation showing the post | ❌ | Silent dismiss (`create-post.tsx:182-183`). |
| Readable "posts disappear at 5am" note | 🟡 | Present at `text-white/30` at the bottom of the scroll. |

**Estimate:** 2.5 days.

---

## 6. Button labels and behavior

| Item | Status | Detail |
|---|---|---|
| Plans "+" creates a plan | 🟡 | Plans has a labeled "Share a plan" row (`plans-feed.tsx:332-345`) → `/create-plan`. ✅ But the unlabeled neon "+" FAB on Home floats over the Plans view too and opens the post form (`(home)/index.tsx:417-426`). Will hide or relabel it on Plans. |
| Messages "+" and "New Chat" same flow | 🟡 | Both go to `/new-chat`. Header icon is a plain "+"; will switch to a compose icon. |
| "Share" → "Share profile" | ❌ | `profile.tsx:310`. String. |
| "Edit" → "Edit profile" | ❌ | `profile.tsx:304`. String. |
| Map "Stop" → "Stop sharing", bigger target | ❌ | `map.tsx:593-604`: text-only, `hitSlop={6}`, well under 44pt. |
| Map recenter arrow | 🟡 **bug** | `map.tsx:418` flies to the **city center**, not the user, and hard-sets zoom 13. Does not touch filters. ✅ on filters. |
| Filter icon active state + reset | 🟡 | Icon tints neon when active (`map.tsx:545-553`). No badge, no Reset/Clear anywhere (`app/map-filters.tsx`). |
| Notification bell styling | ❌ | Solid purple fill on every screen, always (`index.tsx:198-212` and four siblings). Unread is only a red count badge. |
| S logo | ❌ | It is a `Pressable` that opens the status flow on all four tab headers (`index.tsx:213-219` etc.) with no label or accessibility label. Will relabel as the "Update status" entry or make it decorative. |
| Consistent selected/ordinary/disabled styles | ❌ | No token layer. `lib/theme.ts` is 7 lines; NEON/PURPLE are re-declared in 8+ files; at least four different "selected" idioms. Fixing this is a prerequisite for §9 contrast. |

**Estimate:** 1.5 days (token layer counted under §9).

---

## 7. Map and venue screens

**Verified**
- 🔍 **Map filters never change sharing audience: VERIFIED CLEAN.** `lib/map-filters.ts` has no Supabase import; `app/map-filters.tsx` imports only router, UI, and the filter store. The only writes to `profiles.location_sharing_level` are the deliberate status controls (`profile.tsx:184`, `check-in.tsx:322, 339`). Only reassurance copy is missing.
- 🔍 Directions (Apple Maps with Google fallback), Share (text only, no link), More Info (events, hours, trending, rating): all functional (`venue.tsx:320-334, 515-569`).
- Relationship badges Close Friend / Friend / Mutual already used on the friend card (`friend-id-card.tsx:170-174`). ✅

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| Separate people filter from show-venues | ❌ | Confirmed as reported: `'friends_only'` is what blanks the venue array (`map.tsx:336-341`); labels say "Show all friends & venues" / "Hide venue pins" (`map-filters.tsx:12-16`). No `showVenues` boolean exists. |
| People filter = Close Friends / Friends / Friends + Mutuals | ❌ | Current values `'all' / 'close' / 'friends_only'`. Mutuals are never filterable. Data layer already classifies close/direct/mutual (`use-map-data.ts:11, 139-140`). |
| Venue type filter | ✅ | Exists, single-select, applied after the people filter. |
| Compact expandable venue sheet | ❌ | `venue` is `presentation: 'modal'` (`_layout.tsx:58`), full height, fixed 160pt banner. Matches the "Electric Bleu blank panel" report. Will move to `formSheet` with detents like the other sheets. |
| Who's-there prominent | 🟡 | Rendered below the banner as a small avatar stack; the neon "Invite Friends Here" dominates. |
| Dismiss returns to same map position | 🟡 | Dismiss is fine, but opening flies to the venue at zoom 15 first (`map.tsx:363-366`), so the user returns to a moved map. |
| Bookmark saved state | 🟡 | Works (optimistic, `venue.tsx:299-318`) but is an icon-tint-only change with no label; optimistic state is never rolled back on failure. |
| Dismissible while loading; Retry on failure | 🟡 | Dismissible ✅. No `isError` handling: a failed load is an infinite spinner (`venue.tsx:128, 446`). |
| Share includes a link | 🟡 | Text only. Can add an invite-style link. |

**Estimate:** 3 days.

---

## 8. Empty screens and status copy

**What works**
- Close Friends add/remove works both ways: star on each friend row and in the action sheet (`friends.tsx:163-178, 197-209, 344-352`). ✅ Discoverability could improve (no label on the star).
- Contacts denied shows copy + Open Settings (`contacts-sync.tsx:156-170`). 🟡 No fallback to Invite Friends, no recheck on return.
- Feed and Messages show loading skeletons. ✅

**What needs changing**

| Item | Status | Detail |
|---|---|---|
| Plans says "Nobody's out yet… update your status" while the user is Out | ❌ **confirmed** | Single empty state (`plans-feed.tsx:235-245`). `myStatus` is fetched but never consulted there. Friend count is never read; `useFriendsOut` returns empty for both "no friends" and "friends not sharing". |
| No friends → "Add friends to see who's out" + button | ❌ | Not on Plans, Feed, Messages, or the Friends screen. Find/Invite Friends are reachable only from Profile. |
| Friends but nobody sharing | ❌ | |
| No posts → explain + posting CTA | 🟡 | Feed empty copy rotates on clock hour; posting CTA exists. |
| No messages + no friends → Add Friends | ❌ | Only "New Chat" (`messages.tsx:462-468`). |
| No results due to filters → Clear Filters | ❌ | Map has no clear action. |
| Loading/error not shown as empty | 🟡 | Loading OK; **errors render as empty states** on Plans, Feed, Messages, Venue. |
| No-status user: aggregate cues, no precise pins, CTA | ❌ | Depends on §1 gate. |
| TBD user: surface when friends go Out | ❌ | Nothing. Will add an "N friends are out now" banner on Plans/Feed for `planning` users, driven by the existing realtime `night_statuses` subscription. |

**Estimate:** 2 days.

---

## 9. Leaderboard and layout refinements

| Item | Status | Detail |
|---|---|---|
| Biggest Mover overlays rows | ❌ **confirmed** | Absolute-positioned sibling after the list (`leaderboard.tsx:319-342, 437`). Will become a list footer/header item. |
| Bottom nav hides last item | 🟡 | Native tab bar; padding is per screen. Leaderboard and Plans OK; **Home feed `pb-6`, Messages `pb-6`, Profile `pb-10`** are too small (Log Out sits under the bar). |
| Rows tappable → venue | 🟡 | `openVenue` is correct but the Pressable wraps only the venue-name text (`leaderboard.tsx:167-178`). Whole row will be tappable. |
| "1 spots" → "1 spot" | ❌ | `profile.tsx:283-285` hard-codes the plural. Same for "friends". |
| Contrast | ❌ | Widespread `text-white/25` to `/50` on dark backgrounds across leaderboard, venue, map legend, unselected controls. Fixed via the token pass from §6. |
| Bottom sheet opacity | ❌ **root cause found** | Every formSheet sets `contentStyle: { backgroundColor: 'transparent' }` (`_layout.tsx:65-130`) and the check-in root has no background of its own (`check-in.tsx:358`), so the neon glow bleeds through near "Somewhere else…". Will add an opaque sheet background. |
| Larger text sizes | ❌ | Zero Dynamic Type handling (`allowFontScaling` / `maxFontSizeMultiplier` unused). Many fixed heights (`h-10` headers, `h-11` buttons, `numberOfLines={1}` titles). Will set a max multiplier and audit fixed heights. |
| Header branding | 🟡 | Consistent on three tabs; Home shrinks the wordmark on scroll and lacks `numberOfLines`. |

**Estimate:** 3 days (includes the shared token layer used by §6).

---

## 10. Comment composer

**What works**
- Input is docked above the keyboard via `KeyboardStickyView` (`comments.tsx:203`). ✅ This can be kept.
- Feed scroll position survives because the feed is not unmounted. ✅

**What needs changing**
- `comments` is `presentation: 'modal'` (`_layout.tsx:51`): a full-height takeover with its own header. The post is not visible.
- No detents, no tap-outside dismiss, no post context above the sheet.

**Plan:** switch to `formSheet` with detents (the pattern already used for check-in, friend-card, map-filters), remove the full-screen chrome, render the post header/media above the comment list, and scroll the feed so the post sits above the sheet.

**Estimate:** 1.5 days.

---

## 11. Morning After Debrief

**What exists today**
- One local notification scheduled at **10:00 device-local** after a venue or party check-in (`check-in.tsx:55-73`), titled "Last night on Spotted ☀️ / See who you crossed paths with…", deep-linking to `/activity`, which is the ordinary notifications inbox. There is no recap screen, card, query, or table. The notification currently promises something the app cannot show.

**Data available (encouraging)**
- `checkins` has `started_at` / `ended_at` per venue per user: this gives the user's own venue sequence and the interval join for crossed paths.
- `posts` and `yap_messages` have timestamps and venue context, but both **expire at 5am**, so the recap must snapshot them before cleanup.
- `location_events` has dwell time and friends-at-venue counts for "most social stop" style facts.
- Privacy RPCs already exist: `can_see_location`, `is_close_friend`, `is_direct_friend`, `is_mutual_friend`, `get_mutual_friend_ids`.
- `night_statuses` is one row per user with no history; it cannot be used for a timeline.

**Plan**
1. Server-side generator (Supabase edge function on the nightly cron, run just after the 5am reset): for each user with ≥1 check-in last night, build `night_recaps` row: venue sequence, crossed-paths list filtered through the existing visibility RPCs, snapshot of own posts/yaps, summary stats. Skip users below an activity threshold.
2. Recap screen (story-style, swipeable cards) + "Your night last night" card on Home when an unviewed recap exists.
3. Rewrite the notification to fire only when a recap row exists and to deep-link to it.
4. Private Party entries show neighborhood only, never `party_address`. Mutual crossed-paths only when `is_mutual_friend` permits. Overlap copy uses "You were both at [Venue] last night".

**Questions**
- ❓ `cleanup_old_checkins` exists in the DB. Its retention window must be confirmed in the dashboard so `checkins` survives until the generator runs.
- ❓ Generation server-side (recommended: consistent, privacy-safe, one place) requires adding a table and edge function. Confirm that DB changes are in scope.
- ❓ Should the recap be dismissable forever after viewing, or stay reachable from Profile for a few days?

**Estimate:** 8 days.

---

## 12. Verification before completion

All items on the client's list map to the sections above and will be run on two physical devices with a Close Friend, direct friend, mutual, and out-of-audience account. Items already traced in code:

- 🔍 Map filters do not change sharing permissions: **passes** (§7).
- 🔍 Yes alone does not start sharing: **passes at the DB level**; permission prompts on Yes are the perceived problem (§3).

Note on tooling: the iOS simulator cannot inject taps for the gesture-heavy items (swipe-dismiss attempts, hold-to-record, double-tap flip). Those need a physical device.

**Estimate:** 3 days.

---

## Cross-cutting decisions needed from the client

1. **Reset time and zone:** 5:00 AM in the profile city's zone for statuses, check-ins, posts, and the debrief boundary. Confirm.
2. **Private Party exact spot:** Close Friends only (recommended, matches copy) vs Friends (current behavior).
3. **Flip during recording:** ship double-tap flip before capture; mid-recording flip deferred.
4. **Text-only posts:** keep or drop in the camera-first flow.
5. **Debrief storage:** approve a new `night_recaps` table + edge function.
6. **Android:** all estimates are iOS. Android needs its own camera/permission pass and the Transistorsoft license.

## Pre-existing blockers unaffected by this doc
- Transistorsoft trial license expires **Oct 7, 2026**; the paid key is required for release builds.
- Twilio account suspended; phone OTP cannot send.
- `daily-cleanup` cron and `cleanup_old_checkins` retention need dashboard verification (now possible).
