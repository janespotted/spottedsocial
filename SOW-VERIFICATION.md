# SOW Verification — React Native App vs. spottedlaunchsow.md

**Date:** Sept 8, 2026 · **Branch:** `feature/react-native-migration`
**Context:** The SOW was written for the Capacitor/web build. The app is now
React Native (Expo SDK 57) — Capacitor-specific items are re-mapped to their
RN equivalents; the web PWA still exists for web users.

**Status legend:**
- ✅ PASS — verified in code (device verification still recommended where noted)
- 🔧 FIX — real gap, needs work (numbered in the fix list at the bottom)
- 📱 DEVICE — code looks right; needs a physical-device test to sign off
- 🔑 CLIENT — blocked on client credentials/accounts/decisions
- ➖ N/A — Capacitor/web-specific, superseded by the RN architecture

---

## §3 Auth, onboarding & account lifecycle

| Item | Status | Notes |
|---|---|---|
| Phone + SMS OTP sign-up/login | 🔑 CLIENT | Twilio account suspended (error 20003) — OTP flow is built (`auth/otp.tsx`) but SMS cannot send until the client fixes billing. |
| "Phone-OTP ONLY — remove email/password" | 🔧 FIX #12 / 🔑 CLIENT | **Deliberate deviation:** email/password was added as a workaround while Twilio is down. Once Twilio is restored, client must decide: remove email/password (SOW says yes) or keep as fallback. |
| Rate limiting on SMS endpoint | 🔑 CLIENT | Supabase Auth built-in throttles apply; verify settings in dashboard (no access currently). |
| Sessions persist across restarts | ✅ PASS | AsyncStorage-backed session, `persistSession: true`. |
| Logout clears session | ✅ PASS | `supabase.auth.signOut()` in Profile + Settings. |
| Onboarding (welcome → username) | ✅ PASS | Gating via display_name+username completeness (live DB lacks `has_onboarded`). |
| Permission prompts at right time | 📱 DEVICE | Location asked on first Go Live; notifications after onboarding; contacts on Contacts Sync open. Verify order feels right on device. |
| Zero-friends first-run not dead | ✅ PASS | Leaderboard/map populated by bootstrap venues; invite prompts on Profile + empty states. |
| Username uniqueness | ✅ PASS | Regex + debounced uniqueness check in edit-profile and onboarding. |
| Profile edit reflects everywhere | ✅ PASS | React Query invalidation on save. |
| **Account deletion in-app** | 🔧 FIX #1 — **done, uncommitted** | Was missing (Apple requires it). Added to Settings: type-DELETE confirm → `delete-account` edge function → sign-out. Verify the edge function covers all tables incl. phone number (needs DB access → 🔑). |
| Phone number never exposed | 📱 DEVICE / 🔑 | Client code never selects phone from profiles; full check needs RLS audit against live DB. |

## §4 Location privacy (P0)

| Item | Status | Notes |
|---|---|---|
| Sharing tiers enforced (close/all/mutual) | 📱 DEVICE | Server-side model (`can_see_location`, `get_profiles_safe`) untouched by the migration; mobile reads coords ONLY via `get_profiles_safe` (see mobile/LOCATION.md). Two-account device test required. |
| Per-person hide / block | 📱 DEVICE | Hide/unhide + block/unblock UI ported (Blocked & Hidden, friend card overflow). Enforcement is server-side. |
| Stop Sharing removes everywhere ≤30s | ✅ PASS (code) | `stopSharing` stops watcher, nulls GPS, ends check-ins, resets status; realtime subs refresh other clients. |
| Notifications respect privacy | ✅ PASS (code) | `notifyFriendArrived` filters via `get_visible_recipients`; planning pings tiered by audience. |
| `party_address` never in upsert | ✅ PASS | All three write paths (goPlanning/stopSharing/goOutAtVenue) use the separate-UPDATE pattern (WP6). |
| **Force-quit walk test** | 📱 DEVICE | `stopOnTerminate: true`, `startOnBoot: false` configured. THE critical physical test — check in, force-quit, walk 200m, verify pin frozen from a second account. |
| No stuck "out" state | 🔑 CLIENT | Client-side status gate self-stops the watcher; the `daily-cleanup` edge function needs cron verification in the dashboard. |
| Auto-tracking can't resurrect after stop | ✅ PASS (code) | Every background fix re-checks `isUserCurrentlyOut` (fail-closed) before any write. |
| `profiles` grant redesign (known open item) | 🔑 CLIENT | DB-side task; needs Supabase dashboard/SQL access. |

## §5 Geolocation & check-in (P0)

| Item | Status | Notes |
|---|---|---|
| Permission states degrade gracefully | ✅ PASS | GPS-denied step in check-in sheet with Open Settings; manual venue entry works without GPS. |
| Venue detect + correct + stick | 🔧 FIX #2 | Detection/correction flow ported. Gap: no manual-correction suppression — after manually picking venue B while GPS says A, the background engine can re-nudge A after cooldowns (web had `checkForManualCorrection`). Small guard needed. |
| All check-in entry points consistent | ✅ PASS* | Standard, custom, private party, planning, arrival prompt, smart prompt all route through `goOutAtVenue`/`goPlanning`. *"Heading out" status intentionally not ported (unused half-feature — confirm with client). |
| City derivation | 🔧 FIX #3 | Mobile uses `profiles.home_city` everywhere (no GPS city detection like web). Fine for launch if users set city correctly — but nothing sets `home_city` during onboarding! New users default to 'nyc'. Add city selection to onboarding or GPS detection. |
| Auto-checkout bounded | 🔑 CLIENT | 5am expiry on all statuses; `daily-cleanup` cron needs dashboard verification. |
| Venue loop not hot | ✅ PASS | 100m distance filter + stationary stop; foreground prompts poll every 2 min max. |

## §6 Map (P1)

| Item | Status | Notes |
|---|---|---|
| Pins for exactly the allowed people, freshness | ✅ PASS (code) | Server-masked coords; tonight+<2h freshness; 15min dim / 60min drop. |
| Mutual-pin path | 📱 DEVICE | Ported (location_sharing_level === 'mutual_friends' expansion); needs two-account verification. |
| Venue markers tappable → venue card | ✅ PASS | Opens /venue screen. |
| Friend clustering | ✅ PASS | Same-venue/5m grouping, +N badge. |
| Locate me / no 0,0 fly | ✅ PASS | Recenter uses CITY_CENTERS, never raw 0,0. |
| Map search parity | 🔧 FIX #4 | Map search button opens the global /search modal (people+venues) but tapping a venue result opens the venue page, not fly-to-on-map. Acceptable divergence? Flag for client; fly-to would need search-on-map wiring. |
| Realtime updates + recovery | 🔧 FIX #5 | Updates work; NO reconnect resilience (see §17 finding — applies to all channels). |

## §7 Leaderboard (P1 — product-defining)

| Item | Status | Notes |
|---|---|---|
| **Tunable 75/25 baseline/live blend** | 🔧 FIX #6 | **Not implemented** (neither was it on web — bootstrap mode approximates it). Current ranking: live count desc, then popularity_rank. Needs: `blendedScore = 0.75·baseline + 0.25·live` with the ratio as a documented, tunable constant. |
| Credible board with zero check-ins | ✅ PASS | Bootstrap top-30 by popularity_rank. |
| Live activity visibly moves rankings | 🔧 FIX #6 | Works crudely (count-first sort) but not per the blend spec. Same fix. |
| **"Feels dynamic" — no fake movement** | 🔧 FIX #7 | Movement arrows are `Math.random()` (web parity, but SOW §7b explicitly fails this: "no obviously random/fake-looking jumps"). Replace with real rank-delta tracking between refreshes. |
| Promoted venues per business rules | ✅ PASS | Promo order 1-2, always visible. |
| NYC/LA independent + neighborhood filters | ✅ PASS | City from profile; neighborhood action sheet. |
| Friend avatars respect privacy | ✅ PASS (code) | night_statuses RLS + safe profiles. |
| Admin venue management (§7c) | 🔑 CLIENT / ➖ | Owner tooling lives in the web app's admin screens (unchanged). RN app intentionally has no admin UI. Verify web admin still works before launch; seed lists exist in web demo-data. |

## §8 Plans / TBD (P1)

✅ PASS overall — create/edit/join/leave, who's-down counts, planning visibility tiers, meet-up action all ported in the newsfeed phase. 📱 DEVICE for a two-account pass.

## §9 Messaging (P1)

| Item | Status | Notes |
|---|---|---|
| DMs: send/receive/realtime/reads/typing/reactions | ✅ PASS | Full port. |
| Group chats: create / add-remove members | 🔧 FIX #8 (partial) | Group rename/photo/messaging work. **Group creation + add/remove members don't exist** (web has "coming soon" too — but SOW lists it as acceptance criteria). Client call: build group creation or descope with sign-off. |
| Yap visibility documented | ✅ PASS | Directory: city-wide, tonight, non-party yaps. Thread read: anyone; post: checked-in only; party yaps: party threads only. |
| Blocked users can't message | 📱 DEVICE | RLS-enforced; block severs via `blocked_users`. Verify on device. |
| History pages correctly | 🔧 FIX #9 | DM thread loads ALL tonight messages in one query (no pagination). Fine for tonight-scoped threads; flag if threads ever exceed ~500 msgs. Low priority. |
| Realtime resilience | 🔧 FIX #5 | Same global gap. |

## §10 Notifications (P1)

| Item | Status | Notes |
|---|---|---|
| Push delivery all types | 📱 DEVICE / 🔑 | Needs real device + APNs key (TestFlight build). |
| In-app activity matches | ✅ PASS | Activity screen + unread badge. |
| Privacy filtering | ✅ PASS (code) | get_visible_recipients on arrival pushes; audience tiers on planning. |
| Graceful permission denial | ✅ PASS | try/catch no-ops; in-app feed unaffected. |
| Throttling / no spam | ✅ PASS | 30-min rate limits (arrival), 30-min dedup (planning), engine cooldowns. |
| Deep links open right screen | ✅ PASS | data.url routing in push manager. |
| **APNs key rotation** | 🔑 CLIENT | The old exposed key must be rotated at Apple + Supabase secrets. P0 security item, client-blocked. |
| Stale token cleanup | ✅ PASS | `clear_stale_push_token` on registration. |

## §11 Search — ✅ PASS with 🔧 FIX #4 (map fly-to divergence noted above).

## §12 Camera & media (P1)

| Item | Status | Notes |
|---|---|---|
| Capture/gallery/upload | ✅ PASS | expo-image-picker camera+library, private bucket + signed URLs. |
| Post visibility enforced | ✅ PASS (code) | visibility column + feed filters; RLS server-side. |
| Stories | ➖ / 🔑 | Not ported; stories table exists but web feature status unclear — confirm with client whether stories are in launch scope. |
| Native Spotted camera (UIKit) | ➖ | The custom Capacitor camera plugin (CLAUDE.md) was NOT ported — RN uses the system picker/camera. Confirm client accepts this or scope a port of the hold-to-record camera. **Flagged as FIX #10 pending client decision.** |
| Moderation actions | ✅ PASS | Report/block/delete everywhere. |

## §13 Feed — ✅ PASS (pagination, refresh, realtime, viewport video pause, empty states).

## §13A Morning After recap (P1)

🔧 FIX #11 — Mobile schedules a 10am local notification but it deep-links to
the plain Activity screen; there is **no recap experience** (banner/modal with
venues visited, crossed paths, photos). Web has the full flow. Needs a port or
a client-approved descope for v1.

## §14 Friends & social graph (P1)

| Item | Status | Notes |
|---|---|---|
| Requests send/accept/decline | ✅ PASS | Friends screen + suggestions + contacts sync. |
| Close friends drive privacy tier | ✅ PASS | Star toggles write `close_friends`. |
| Contact sync privacy | ✅ PASS | Numbers normalized client-side, matched via edge function, never stored raw. |
| Block/unblock downstream | 📱 DEVICE | UI complete; RLS enforcement device-verify. |
| **Tap name/avatar ANYWHERE → Friend ID card** | 🔧 FIX #13 | NOT consistent. Friend card exists only on the map. Post authors, comment rows, likes list, activity rows, plan cards, thread headers etc. are mostly dead or inconsistent. Audit agent results pending — will list every surface. Needs a shared openFriendCard route (likely a /friend-card form sheet usable app-wide). |

## §15 Demo mode (P0)

✅ PASS by architecture — `DEMO_MODE = __DEV__` compiles to false in release;
no UI toggle, no URL param in the RN app. Audit agent sweep for per-query
`is_demo` filter gaps pending — any findings become FIX #14. Web app's demo
settings remain admin-gated (unchanged). `is_demo` spoofing prevention is
RLS-side (🔑 verify with DB access).

## §16 Security (P0)

| Item | Status | Notes |
|---|---|---|
| Full RLS audit | 🔑 CLIENT | Requires live-DB SQL access (information_schema/pg_policies). Not possible with anon key alone. |
| Secrets in source | ✅ PASS (client code) | Only EXPO_PUBLIC anon key + public Mapbox token in mobile/.env (gitignored). Transistorsoft trial key in app.json is license-class, not secret. Git-history scan for the old APNs key → 🔑 rotation regardless. |
| Edge function authorization | 🔑 CLIENT | Needs function source review in dashboard/repo (supabase/functions present in repo — separate audit possible on request). |
| Input validation | ✅ PASS | Length caps + validation lib on all composers. |

## §17 Performance & realtime (P1)

| Item | Status | Notes |
|---|---|---|
| Smoothness / no jank | 📱 DEVICE | Native map + LegendList recycling; verify on older hardware. |
| **Realtime resilient reconnect** | 🔧 FIX #5 | Mobile channels are plain `.subscribe()` — no reconnect handling, no refetch-on-reconnect, no AppState/NetInfo wiring for React Query (refetchOnWindowFocus is a no-op in RN without focusManager). Web had `createResilientChannel`. Port it + wire focus/online managers. Audit agent inventory pending. |
| No runaway polling | ✅ PASS | Intervals: 2min status, 60s canPost; GPS distance-filtered. |
| Offline behavior | ➖ (descoped) | Offline cache deliberately skipped this release (client decision). Errors degrade to empty states. |
| Leaks from subscriptions | ✅ PASS (code) | All effects return cleanup; verify long-session on device. |

## §18/§18A UI polish & device fit

📱 DEVICE — needs a pass on SE / standard / Max sizes. Known-good: safe areas
via pt-safe/pb-safe utilities everywhere, KeyboardStickyView pattern
(Capacitor keyboard rules are ➖ obsolete — RN uses keyboard-controller).
Dynamic Type: 🔧 FIX #15 (fonts are fixed-size; large-text audit not done).

## §18B Sharing & deep links (P1)

| Item | Status | Notes |
|---|---|---|
| **Universal links / AASA** | 🔧 FIX #16 / 🔑 | RN app has only the `spotted://` scheme — no `associatedDomains`, so shared https links never open the app. Needs client's Apple team + domain, then app.json config + AASA file on the web host. |
| Invite links work | ✅ PASS (web fallback) | Links point to the Vercel web app; invite attribution handled by the web landing. App-open deep linking blocked on FIX #16. |
| DM-a-post in-app | ✅ PASS | Share sheet → `[shared_post:id]` renders + mutual-friend recipient filter. Tap-through to the post: 🔧 FIX #17 (card is display-only; feed lacks scroll-to-post). |
| Native share sheet | ✅ PASS | Invites, posts, profile share. |
| OG/link previews | 🔑 CLIENT / web | Web app's meta tags — verify on the Vercel side. |

## §19 App Store readiness (P0)

| Item | Status | Notes |
|---|---|---|
| Device build works | ✅ PASS | `expo run:ios` build verified through this migration. |
| Background location per Apple rules | 📱 DEVICE | Config correct; walk test pending. |
| Info.plist strings | ✅ PASS | Location (both), motion, camera, photos, contacts all present. |
| Push on real device | 🔑 CLIENT | APNs key. |
| Icon / launch screen | ✅ PASS | Set in app.json. |
| Survives background/foreground | 📱 DEVICE | |
| Privacy labels, age rating, UGC moderation | 🔑 CLIENT | App Store Connect work; UGC requirements met in-app (report/block on all content). |
| Account deletion (Apple req.) | 🔧 FIX #1 — done, uncommitted | |
| TestFlight beta | 🔑 CLIENT | EAS + accounts. |

## §20/§21/§22 — Schema reconciliation, deliverables

🔑 CLIENT — DB drift reconciliation, regenerated types.ts (three tables are
already missing from types: `dm_message_reactions`, `dm_typing_indicators`,
`location_hidden` — casts in code mark every spot), RLS sign-off, and the
written test report all need DB access and device rounds.

---

**Found + fixed during two-simulator testing (Sept 12):** `home_city` column never existed in prod — live column is `city` (`3fb2685`); search couldn't match @-prefixed usernames and had dead people rows (`afaa05a`); meet-up requests had no accept flow (`48237fe`); chat composer sat under the native tab bar → threads now push over the tab UI as root routes (`5c26be5`); thread back button stranded on deep links (`f59d718`); **Supabase session silently expired after ~1h because RN requires AppState-driven token auto-refresh — app-wide query failures until relaunch** (`367757c`); DM thread rebuilt on the keyboard-controller chat pattern with message entrance animations (`9d0e669`); Friend ID card wired app-wide (`cd4b7e7`).

# FIX LIST (work through one by one)

**P0 — launch blockers**
1. ~~Account deletion in Settings~~ — **DONE** (commit `cd057ce`)
2. ~~Manual venue correction suppression~~ — **DONE** (commit `e3ab378`): `goOutAtVenue` marks a persisted 30-min manual cooldown gating `canTriggerVenueArrival`
3. ~~`home_city` never set~~ — **DONE** (commit `9c2cb78`): city step in onboarding (NYC/LA/PB picker between username and welcome)
4. Map search: define + implement venue-result behavior on map (fly-to vs venue page) — needs a product call
5. ~~Realtime resilience~~ — **DONE + tested in simulator**: `mobile/src/lib/resilient-channel.ts` (backoff resubscribe + AppState foreground retry/refetch) wired into all 9 channels (feed, notifications, plans, friends-out, leaderboard, map, dm-list, thread, yap-thread); React Query focusManager (AppState) + onlineManager (NetInfo 12.0.1 — **native dep**, rebuild done Sept 12). Verified: channels subscribe, foreground cycle auto-refreshes the feed with no touch input.
   **⚠️ FINDING (Sept 12) — RESOLVED Sept 14: the `supabase_realtime` publication was empty (no postgres_changes for ANY table, ever, web or mobile). With dashboard access the 10 tables were added and delivery is verified end-to-end (authenticated probe receives INSERT events). Realtime is live for the first time.**

**P1 — strongly before launch**
6. Leaderboard tunable 75/25 baseline/live blend (documented constant)
7. Replace `Math.random()` movement arrows with real rank-delta tracking
8. Group chat creation + add/remove members (or client-approved descope)
9. DM pagination (low urgency — tonight-scoped)
10. Native hold-to-record camera port (client decision — system camera works today)
11. Morning After recap experience (currently just a notification)
12. Remove email/password auth once Twilio restored (client decision)
13. Friend ID card everywhere — **mostly done** (`cd4b7e7`): shared /friend-card form sheet (self-fetching by userId) wired into feed authors, comment rows, who-liked list, search results, activity rows. Still dead: plan cards, DM thread header/message avatars, leaderboard friend stacks (currently ActionSheet by design). Search rows also got Add-friend buttons (`afaa05a`); activity friend-request rows now route to /friends (`a8d7de5`).
14. Any demo-filter gaps from the audit *(agent pending)*
15. Dynamic Type / large-font audit
16. Universal links (associatedDomains + AASA) — config half is ours, domain/team half is client
17. Shared-post tap-through (needs feed scroll-to-post)

**Client-blocked (tracked, not ours to start)**
- Twilio reactivation · APNs key creation + rotation · Transistorsoft license (Oct 7!) · RLS/schema audit + reconciliation (DB access) · App Store Connect setup · TestFlight round · web admin venue seeding

*(Sections marked "agent pending" will be updated when the three code-audit
agents finish: demo-leak sweep, avatar-tap audit, realtime-channel inventory.)*
