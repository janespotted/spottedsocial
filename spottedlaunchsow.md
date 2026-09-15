# Spotted — Pre-Launch Scope of Work & QA Acceptance Checklist

**Prepared for:** contract engineer engagement
**Goal:** verify and harden every part of the Spotted app so it is bug-free, secure, and launch-ready.
**Owner:** Jane Reynolds

---

## 0. How to read this document

This is both a **scope of work** (what to do) and an **acceptance checklist** (how we agree it's done). Every functional area below has **acceptance criteria** — the contractor's work is complete for that area when each criterion is demonstrably true, verified on a real device and against the live database, not just "it compiled."

Severity language used throughout:
- **P0 — launch blocker.** Must be fixed/verified before any public launch. Privacy, security, data loss, or core-flow-broken.
- **P1 — pre-launch strongly preferred.** User-visible correctness or polish that materially affects first impressions.
- **P2 — fast-follow.** Can ship shortly after launch.

---

## 1. Tech stack & context (read before starting)

- **Frontend:** React + TypeScript + Vite, Tailwind, shadcn/ui components.
- **Native:** Capacitor (iOS primary; wrapping the web build). Chromium/WebView.
- **Backend:** Supabase — Postgres with **Row-Level Security (RLS)**, Edge Functions (Deno), Realtime, Storage, Auth.
- **Maps:** Mapbox GL.
- **Hosting:** Vercel (web PWA) + TestFlight/App Store (iOS).
- **Push:** APNs (via Supabase edge functions).
- **Auth:** phone number + SMS OTP only (no email/password, no social login).
- **Launch markets:** NYC and LA only.
- **Demo mode:** an internal/admin tool ONLY — must be fully inaccessible to regular users in the launched product (see §15).

### ⚠️ CRITICAL codebase reality — the #1 thing to internalize
**The git repo and the live Supabase database have drifted apart.** Multiple database objects (foreign keys, function signatures, RLS grants) were changed directly in the Supabase dashboard/SQL editor and never written back into migration files. As a result, **the migration files and generated `types.ts` do NOT reliably describe the live database.** Confirmed drift found so far: a missing `checkins → venues` foreign key, an altered `has_role()` signature, and `profiles` table grants that differ from what migrations imply.

**Mandatory rule for this engagement:** verify all schema, function signatures, constraints, and grants **empirically against the live database** (via `information_schema` / `pg_proc` / `pg_policies` queries), never by trusting migration files or `types.ts`.

### Deliverable that comes out of this: schema reconciliation
Part of the scope (see §12) is to **reconcile the live DB back into version-controlled migrations** and regenerate `types.ts`, so this drift stops causing bugs.

### Environment & workflow rules
- All production SQL changes go through migration files and `supabase db push` — **no ad-hoc dashboard SQL** that isn't captured in a migration.
- Never add a permissive (`USING (true)`) RLS policy to the `profiles` table — it holds raw GPS/PII and its column-level grants do not fully protect it (see §4).
- Respect the existing `CLAUDE.md` in the repo (documents keyboard-handling patterns, demo-mode safety rules, and past bugs not to reintroduce).
- Test cache-sensitive changes in a fresh private browser window; verify the deployed JS bundle hash matches production before concluding "a fix didn't work."

---

## 2. Phase plan (suggested sequencing)

1. **Phase 0 — Baseline & environment:** get the app running locally + on a device, stand up a staging Supabase project if possible, reconcile DB drift, establish a device test matrix.
2. **Phase 1 — Security & privacy audit (P0):** the highest-stakes work. Auth, RLS, location privacy, edge-function authorization, secrets.
3. **Phase 2 — Core flow verification (P0/P1):** signup → onboarding → check-in → map → messaging → posting, every loop.
4. **Phase 3 — Feature-by-feature QA (P1):** every button, every screen, every state.
5. **Phase 4 — Native/iOS & performance (P1):** device behavior, background location, battery, App Store readiness.
6. **Phase 5 — Polish & fast-follow (P2):** UI smoothness, edge cases, accessibility.

---

## 3. Authentication, onboarding & account lifecycle

**Scope:** every path a user takes into, through, and out of an account.

**IMPORTANT — auth model:** Sign-up and login are **phone number + SMS one-time-code (OTP) ONLY.** There is no email/password and no social login. All auth acceptance criteria are for the phone flow. If any email/password or OAuth code paths still exist in the codebase, they should be removed or disabled so phone is the single, clean path.

Acceptance criteria:
- [ ] Sign up with phone number works end-to-end: enter number → receive SMS code → verify → account created.
- [ ] SMS OTP delivery is reliable (test multiple carriers if possible); resend-code and code-expiry behave correctly; invalid/expired codes show clear errors.
- [ ] Login for a returning user via phone + OTP works; sessions persist across app restarts and devices ("stay logged in").
- [ ] Rate-limiting / abuse protection on the SMS endpoint (a bad actor can't spam OTPs or rack up SMS costs); verify per-number and per-IP throttling.
- [ ] Phone-number normalization/validation (country codes, formatting) is correct; the same real number can't create two accounts.
- [ ] Logout works and fully clears session.
- [ ] **Phone onboarding feels smooth and fast** end-to-end: entering a number, receiving the code, and auto-advancing (auto-read/auto-fill the SMS code where the OS supports it) is quick with no confusing steps, dead ends, or unexplained waits. The number-entry field has a country-code picker/formatting; the code-entry screen shows clear resend/timer states; errors (wrong code, expired, bad number) are human-readable. Test the full flow on a real device, first-time, until it feels effortless.
- [ ] Onboarding carousel / permission prompts (location, notifications, contacts) appear at the right time, in a sensible order, and denying each degrades gracefully (no dead ends, no crashes). A brand-new user reaches a usable home state without confusion.
- [ ] The first-run experience for a user with zero friends is not empty/dead — clear prompts to invite/find friends, and the app still demonstrates value (map, leaderboard) immediately.
- [ ] Username uniqueness/validation enforced; no two accounts can collide on identity fields the app treats as unique.
- [ ] Profile edit (name, username, avatar, bio) saves and reflects everywhere.
- [ ] **Account deletion** fully removes or anonymizes the user's data across ALL tables (profiles, checkins, night_statuses, messages, friendships, location_hidden, blocked_users, notifications, location_events, stories, posts, push tokens, **and the phone number**) — verify no orphaned rows and no residual PII. Confirm the delete-account edge function covers every table.
- [ ] The phone number is stored securely, never exposed to other users via API/RLS, and never appears in URLs/logs.
- [ ] Auth tokens are handled securely (no tokens in URLs, logs, or client storage beyond what's necessary).

---

## 4. Location sharing & privacy rings (HIGHEST PRIORITY — P0)

**Context:** this system was recently audited and largely rebuilt. The server-side privacy model is centered on a single `can_see_location(viewer, target)` SECURITY DEFINER function that enforces: block (either direction) → per-person hide (`location_hidden`) → sharing level (`location_sharing_level`: `close_friends` / `all_friends` / `mutual_friends`). RLS on `night_statuses` and `checkins` routes through it; profile GPS is masked via `get_profiles_safe()`.

**The contractor must independently re-verify the entire privacy model** — do not take prior work on faith.

Acceptance criteria — enforcement:
- [ ] With sharing = **Close Friends**: a direct-but-not-close friend sees NOTHING (no map pin, no pill entry, no leaderboard avatar, no invite-modal entry, **and no notification**). A close friend sees everything.
- [ ] With sharing = **All Friends**: all accepted friends see location; non-friends see nothing.
- [ ] With sharing = **Mutual**: friends-of-friends (≥1 shared friend) see location; strangers don't.
- [ ] **Per-person hide** (`location_hidden`): hidden person sees nothing and gets no notifications; unhiding restores visibility (propagation within seconds or on next refetch — verify both directions).
- [ ] **Block**: cuts visibility BOTH directions immediately; blocked user cannot see blocker and vice versa; verify `can_see_location` returns false both ways at the DB level.
- [ ] **Stop Sharing** removes the user from every surface (map, pill, invite modal, activity) within ~30s without the viewer interacting.
- [ ] **Notifications respect the privacy model** — check-in/arrival/FOMO notifications are filtered so only people allowed to see the sender's location receive them (including on silent/auto check-ins).
- [ ] **Private party address** (`party_address`) is readable ONLY by the host and explicitly invited friends — never by the general friend ring — and is cleared on every status change and by the nightly cleanup.

Acceptance criteria — no stale/leaked location:
- [ ] After Stop Sharing or going home, no background process (native background-geolocation watcher, heartbeat interval, or check-in modal interval) continues writing the user's GPS. **Verify on a real device: check in, force-quit the app, travel 200m+, and confirm from a second account that the user's pin does NOT follow them.** (This is the single most important physical test in the whole engagement.)
- [ ] `profiles.is_out` and `last_known_lat/lng` cannot persist "stuck out" indefinitely; the daily cleanup + status gating cap any resurrection at ≤24h.
- [ ] Auto venue-tracking cannot resurrect a check-in or re-notify friends after the user has stopped sharing (no time-of-check-to-time-of-use race).
- [ ] Blocking/unfriending invalidates all relevant client caches so an ex-friend's location does not linger on screen.

Acceptance criteria — data model integrity:
- [ ] The three "am I out" stores — `profiles` (is_out/GPS), `night_statuses` (status/venue/expiry), `checkins` (open/closed) — stay consistent across every write path (check-in, update spot, quick status, planning/TBD, stop sharing, auto-checkout, venue arrival). No path leaves them disagreeing.
- [ ] Status expiry uses ONE consistent timezone rule everywhere (no path where a user's visibility dies hours earlier/later depending on which button they used).

### ⚠️ Known open item (P0/P1): `profiles` grant redesign
The `profiles` table currently has a table-level SELECT grant that makes its column-level grants decorative — meaning the row-level policy is the *only* wall around GPS/PII columns. Scope: revoke table-level SELECT, grant an explicit safe-column allowlist, keep cross-user reads flowing only through `get_profiles_safe()`, and verify no own-profile read paths (settings, push-token reads) break. Test exhaustively.

---

## 5. Geolocation, venue detection & check-in flows (P0)

Acceptance criteria:
- [ ] Location permission handling is correct on iOS (While Using vs Always) and web; each state degrades gracefully.
- [ ] GPS venue detection returns the correct nearby venue; the "confirm your location / select another" flow lets the user correct it, and the correction sticks (auto-tracking must not immediately override a manual correction).
- [ ] Every check-in entry point produces consistent state: standard venue, custom venue, private party, "heading out," planning/TBD, venue-arrival prompt, quick status.
- [ ] City is derived correctly (GPS + check-in venue) and the city badge matches reality; changing cities updates the relevant surfaces.
- [ ] Auto-checkout works: user is removed after leaving/inactivity; verify worst-case "appears at a venue after leaving" is bounded and reasonable, and that an app-killed user doesn't stay "out" beyond expiry.
- [ ] The venue-detection loop does not run excessively hot (repeated GPS + venue queries every few seconds) — profile and throttle for battery and query volume.

---

## 6. Map (P1)

Acceptance criteria:
- [ ] Friend pins render for exactly the people allowed to see the user, with correct freshness (stale locations age off).
- [ ] Close / direct / mutual friend visibility all render correctly as pins (verify mutual-friend pins specifically — this was a known broken path).
- [ ] Venue heat/markers render and are tappable; tapping opens the venue card.
- [ ] Clustering (friends at the same venue group into one marker) works and is accurate.
- [ ] "Locate me" / fly-to-current-location button works and never flies to a default/0,0 location.
- [ ] Map search matches the app's other search behavior (see §11), returns people + venues + neighborhoods, and actions (fly-to, open card) work.
- [ ] Realtime: a friend going out / stopping / moving updates the map without a manual refresh, and recovers after connection drops (no permanently-dead subscriptions).

---

## 7. Leaderboard & venue management (P1 — important, product-defining)

The leaderboard is a core surface: it must **accurately reflect the hottest spots in NYC and LA** and, critically, **feel alive from day one even before there's a large user base.**

### 7a. Ranking model — hybrid weighting (must implement/verify)
Because the app launches with few users, a purely check-in-driven leaderboard would look dead. The ranking is therefore a **weighted blend**:
- **75% "editorial/baseline" weight** — a curated popularity signal for each venue representing how good/hot a place is to go out (sourced from real-world knowledge of the best NYC/LA nightlife spots). This is what makes the board look credible on night one.
- **25% live weight** — actual real-time check-in/activity data from Spotted users.
- The blend must be **configurable**, and the intent is for the **live weight to grow over time** (and eventually dominate) as the real user base scales. Build it so the 75/25 split is a tunable parameter, not hardcoded — the owner will shift it toward live data as usage grows. Document exactly where this ratio is set.

Acceptance criteria:
- [ ] The leaderboard blends a per-venue baseline popularity score (75%) with live activity (25%) via a clearly documented, tunable weight.
- [ ] With few/zero live check-ins, the board still shows a credible ranking of genuinely hot NYC/LA venues (driven by baseline).
- [ ] As check-ins occur, live activity visibly moves rankings (the 25% has real effect — verify a burst of check-ins nudges a venue up).
- [ ] Rankings are correct per the blend; "biggest mover" logic reflects real momentum; promoted venues appear per business rules.
- [ ] NYC and LA each rank correctly and independently; city/neighborhood filters work.
- [ ] Friend avatars on venues respect privacy (only friends the viewer may see).
- [ ] Realtime updates as check-ins happen; no stale counts.
- [ ] Empty/first-run state renders correctly (but note: with baseline weighting it should rarely be truly empty).

### 7b. "Feels real / dynamic" requirement
The board must not look static between check-ins. Even on a slow night it should feel like a living thing — subtle movement, freshness, and momentum rather than a frozen list. Implement/verify some form of **dynamic behavior** (e.g., time-of-night weighting, gentle rank jitter from recent activity, "heating up / cooling down" indicators, recency decay) so the leaderboard reads as alive. The specific mechanism is the owner's call — the acceptance bar is that a user watching the board over an evening sees it move and feel current, not static.

Acceptance criteria:
- [ ] The leaderboard visibly evolves over an evening (movement/momentum indicators, recency effects) rather than showing a static list.
- [ ] Behavior is believable — no obviously random/fake-looking jumps; movement should tie to real signals (time, check-ins, recency).

### 7c. Venue management / seeding (owner tooling — required)
The owner needs to **manually enter and manage venues before and after launch**, and to experiment with them.

Acceptance criteria:
- [ ] There is a working way for the owner (admin) to **add, edit, and remove venues** — name, neighborhood, city (NYC/LA), coordinates, hours, and the baseline popularity score/weight — without writing raw SQL each time (an admin screen or a clearly documented, safe workflow).
- [ ] The owner can **seed the initial NYC and LA venue lists** (the curated hot spots) and adjust their baseline scores to tune the board.
- [ ] Venue edits reflect on the leaderboard, map, and check-in venue detection consistently.
- [ ] Venue data integrity: no duplicate venues (watch for name-casing dupes — the codebase has had duplicate-venue issues), valid coordinates, correct city assignment.
- [ ] This tooling is admin-only and not exposed to regular users.

---

## 8. Plans, TBD & events (P1)

Acceptance criteria:
- [ ] "Your night" status control (Out / TBD / Staying In) writes correctly and reflects live.
- [ ] TBD/planning friends appear per `planning_visibility` rules (block/hide/mutual all enforced).
- [ ] Creating, editing, joining, and leaving a plan all work; "who's down" counts and avatars are accurate.
- [ ] Events (business/venue events) display and RSVP correctly if in scope.
- [ ] Empty states and the "meet up" action work from every entry point.

---

## 9. Messaging — DMs, group chats, venue yaps (P1, privacy-sensitive)

Acceptance criteria:
- [ ] 1:1 DMs: send, receive, realtime delivery, read receipts, typing indicators, reactions all work.
- [ ] Group chats: create, add/remove members, group avatar, messaging all work.
- [ ] Venue "yap" threads work and their visibility is intentional and documented (who can read a venue's thread?).
- [ ] Blocked users cannot message or be messaged; blocking severs existing threads appropriately.
- [ ] Message history loads/pages correctly; no missing or duplicated messages.
- [ ] Realtime channels are resilient (reconnect after drop); no permanently-dead subscriptions after a network blip.
- [ ] No message content or presence leaks to users who shouldn't see it (RLS verified).

---

## 10. Notifications — push & in-app (P1)

Acceptance criteria:
- [ ] Push notifications deliver on a real iOS device for all notification types (friend check-in, arrival, invites, DMs, planning, FOMO, etc.).
- [ ] In-app activity feed matches what should generate notifications.
- [ ] **Every notification respects privacy** (block, hide, sharing level) — no venue/location disclosure to people who shouldn't see it.
- [ ] Notification permissions handled gracefully when denied.
- [ ] No duplicate, spammy, or mistimed notifications; throttling works.
- [ ] Deep links from notifications open the correct screen.
- [ ] **APNs signing key rotation:** the previous key was exposed in source/git history and must be rotated at Apple and re-set as a Supabase secret; verify push still works after rotation. (P0 security item.)
- [ ] Stale/invalid push tokens are cleaned up.

---

## 11. Search (P1)

Acceptance criteria:
- [ ] Search behaves consistently across Map and Newsfeed/Plans (ideally one shared component): friends grouped by status, venues, neighborhoods, and global people.
- [ ] Results respect privacy/demo filtering.
- [ ] Tapping a result does the contextually correct thing (fly-to on map, open card on feed).
- [ ] Min-character thresholds, empty states, and loading states all behave.

---

## 12. Camera, posting, media & stories (P1)

Acceptance criteria:
- [ ] Camera permission handling (grant/deny) works on iOS and web.
- [ ] Photo and video capture, gallery picker, and upload to Supabase Storage all work.
- [ ] Posting with caption, venue tag, and visibility settings works; posts render in the feed.
- [ ] Post visibility settings are enforced (who can see a venue-tagged post — and confirm this is consistent with, or intentionally distinct from, location privacy).
- [ ] Stories (if in scope): create, view, expiry all work.
- [ ] Media loads efficiently (thumbnails, lazy loading); no giant unoptimized payloads.
- [ ] Likes, comments, reporting, and moderation actions work.
- [ ] Storage RLS: users can only upload/delete their own media; no public bucket leaks.

---

## 13. Feed (P1)

Acceptance criteria:
- [ ] Feed loads, paginates, and refreshes (pull-to-refresh) correctly.
- [ ] Content respects privacy and demo filtering.
- [ ] Likes/comments realtime-update; counts are accurate.
- [ ] Empty and error states render.

---

## 13A. Last night's recap / "Morning After" (P1)

Spotted has a recap feature (the "Morning After" flow — banner, modal, and related logic) that shows a user a summary of the previous night. It must work correctly and feel like a delightful daily hook, not a broken or empty screen.

Acceptance criteria:
- [ ] The recap generates correctly the morning after a night out, pulling the right data (where the user went, who they were out with / crossed paths with, photos/moments, stats) for the correct time window (last night, per the app's 5am-boundary "night" definition).
- [ ] It shows for users who actually had activity, and shows a sensible state (or nothing) for users who didn't — no broken/empty recap, no recap for a night the user stayed in.
- [ ] The recap respects privacy — it must not surface another user's presence/location to someone who wasn't allowed to see it (same privacy rules as everywhere else).
- [ ] The morning-after banner/notification appears at the right time and dismisses correctly; it doesn't re-appear for an already-viewed recap.
- [ ] Any data the recap depends on (check-ins, crossings, photos) is queried against the LIVE schema — verify the underlying tables/columns exist and are populated (this app has had missing-column and repo-vs-live-DB drift issues; confirm empirically).
- [ ] Timezone correctness: "last night" is computed in the user's local/city time, consistent with the rest of the app's night boundary.
- [ ] Performance: the recap loads quickly and media is optimized.

---

## 14. Friends, contacts & social graph (P1)

Acceptance criteria:
- [ ] Send / accept / decline / cancel friend requests all work and update both sides live.
- [ ] Friend request notifications and the requests list render correctly (this had a bug — verify sender profiles load).
- [ ] Close-friends list management works and drives the close-friends privacy tier.
- [ ] Contact sync / "find friends" works with permission handling; respects privacy; no unexpected contact upload.
- [ ] Block / unblock and its full downstream effects (visibility, messaging, notifications) work.
- [ ] Mutual-friends computation is correct and excludes demo users.
- [ ] **Tapping a person's name or avatar ANYWHERE in the app opens their Friend ID card.** This must be consistent across every surface a user appears — map pins/callouts, leaderboard avatars, the friends list, TBD/planning lists, "Around tonight," activity feed, notifications, search results, DM/group chat headers and message rows, comments and likes lists, plans (host + who's-down), venue check-in lists, and anywhere else a name/avatar is shown. Audit every surface; no name/avatar should be a dead (non-tappable) element or open something inconsistent. Use the existing FriendIdCard / openFriendCard flow everywhere (one shared handler — do not build per-screen variations). The card itself respects privacy (shows what the viewer is allowed to see for that person).

---

## 15. Demo mode & admin (P0 for the demo-access requirement)

**IMPORTANT — demo mode must NOT be accessible to users, at all.** Demo mode was an internal development tool. In the launched product, **no regular user should be able to see, reach, toggle, or trigger demo mode or any demo data**, through any path — no UI entry point, no URL parameter (e.g. `?demo=`), no setting, nothing. Demo functionality must be fully gated behind admin-only access (or removed from the user-facing app entirely).

Acceptance criteria:
- [ ] There is **no user-facing way** to enable demo mode: no button, toggle, menu item, deep link, or URL parameter reachable by a normal account. Audit the whole app for any demo entry points and remove/admin-gate them.
- [ ] Regular users never see demo users, demo venues, demo check-ins, demo plans, or any demo content anywhere in the app (map, leaderboard, feed, plans, search, activity, notifications).
- [ ] Demo seeding/clearing (if retained at all) is strictly admin-only and scoped ONLY to the admin's own account — it must never create friendships/data linking demo users to OTHER real users (this previously polluted production; verify with a cross-boundary count query = 0).
- [ ] Any auto-activation of demo mode on sign-up or via links is removed.
- [ ] `is_demo` cannot be set by regular clients to smuggle data into world-readable demo status.
- [ ] Existing demo data does not leak into the production experience of real users (confirm demo rows are filtered out of every user-facing query, or purged).
- [ ] Admin panel is reachable only by admins and all admin tools work.
- [ ] Business/venue features (if launching) work: claim, dashboard, events, promotion.

> Note to contractor: the cleanest end state is that demo mode exists only as an internal admin utility (or is stripped entirely from the shipped build). Treat any way a normal user can reach demo content as a launch blocker.

---

## 16. Cross-cutting: Security (P0)

Acceptance criteria:
- [ ] **Full RLS audit:** every table has appropriate policies; no table is unintentionally world-readable/writable. Test as an authenticated non-owner against every table.
- [ ] SECURITY DEFINER functions (relationship/visibility helpers) are not abusable — a user cannot query arbitrary pairs to enumerate the social graph.
- [ ] Edge functions authorize their callers (admin-gated where needed; cron endpoints require internal auth; no unauthenticated destructive endpoints).
- [ ] **No secrets in source or git history** (API keys, signing keys, service-role keys). Rotate anything exposed. Verify `.env` handling and that the anon key is the only client-exposed Supabase key.
- [ ] No PII in URLs, query params, logs, or analytics.
- [ ] Input validation / rate limiting on user-generated content and abuse-prone endpoints.
- [ ] Permanent data (checkins/location history) retention is bounded and a new friend cannot page a user's entire historical location trail.
- [ ] Storage buckets have correct access policies.

---

## 17. Cross-cutting: Performance, realtime & offline (P1)

Acceptance criteria:
- [ ] App startup and screen transitions are smooth on a mid-range device; no jank on the map or feed.
- [ ] Large components (the map screen especially) don't cause frame drops; consider code-splitting oversized bundles.
- [ ] Realtime subscriptions: all use the resilient reconnect pattern; none die permanently on a single error. Investigate any channels logging repeated CLOSED states.
- [ ] Query volume is reasonable — no runaway polling loops (see geolocation loop, §5).
- [ ] Offline / poor-connection behavior degrades gracefully (cached content, clear error states, no crashes).
- [ ] No memory leaks from unclosed subscriptions/intervals across navigation.

---

## 18. Cross-cutting: UI/UX polish (P1/P2)

Acceptance criteria:
- [ ] Every button, link, and control does something and gives feedback (loading, success, error states) — no dead controls, no silent failures. (Several silent-failure bugs existed where a success toast showed on a failed write — audit for these.)
- [ ] Consistent terminology across the app (e.g., audience labels Close Friends / All Friends / Mutual used identically everywhere; one verb for "start sharing").
- [ ] Consistent tap behavior on names/avatars everywhere → opens the Friend ID card (see §14) — no dead names, no per-screen inconsistency.
- [ ] Consistent visual language (spacing, cards, chips, colors) — no orphaned or mismatched styles.
- [ ] Keyboard handling on inputs is correct on iOS (no double-jump/keyboard-fighting; respect the documented patterns in CLAUDE.md).
- [ ] Safe-area insets respected (notch, home indicator) on all screens.
- [ ] Loading skeletons and empty states everywhere data loads.
- [ ] Timestamps render correctly (no mangled relative times).
- [ ] Modals/sheets open, close, and size correctly (no collapsed/invisible sheets).
- [ ] Basic accessibility: tap targets, contrast, labels on icon-only buttons.

---

## 18A. Responsive layout, device fit & spacing (P1 — high visibility)

The app must look intentional and well-spaced on **every iPhone screen size** and on the **web**, with no awkward gaps, cut-off content, or weird formatting.

Acceptance criteria — iPhone:
- [ ] Spacing and padding feel balanced and deliberate on iPhone (not cramped, not floating) — verify on small (iPhone SE), standard (iPhone 15/16), and large/Max screens, plus at least one older/smaller device.
- [ ] **No awkward empty gap at the bottom of any screen** — content and bottom nav sit correctly against the home indicator; no dead space below the nav, no content hidden behind it.
- [ ] Safe-area insets (notch/Dynamic Island at top, home indicator at bottom) are respected on every screen — nothing tucked under the notch or the indicator.
- [ ] Bottom navigation is always reachable and correctly spaced; fixed elements (e.g., the leaderboard "biggest mover" card, FABs, the map's floating buttons) don't overlap the nav or each other.
- [ ] Long content scrolls correctly; short content doesn't leave a large empty void; both feel right.
- [ ] Landscape (if supported) or locked orientation behaves correctly — no broken layouts.
- [ ] Keyboard appearing/dismissing doesn't create gaps, push the layout awkwardly, or leave the bottom nav floating (respect the documented keyboard patterns in CLAUDE.md).
- [ ] Dynamic Type / larger system font sizes don't break layouts (text truncates or wraps gracefully).

Acceptance criteria — web:
- [ ] The app renders correctly on the **web version** (the deployed Vercel PWA) — no weird formatting, misaligned elements, overflow, or broken spacing compared to the iOS experience.
- [ ] Layouts are responsive across common desktop and mobile-browser widths (the app is designed mobile-first; on desktop it should present cleanly, e.g., centered mobile-width column rather than stretched/broken full-width).
- [ ] Features behave the same on web as on iOS wherever technically possible; any web-only limitations (e.g., native-only push) are known and documented, not silently broken.

## 18B. Sharing, deep links & in-app content sharing (P1 — verify thoroughly)

Sharing is a primary growth loop; every share path must actually work end-to-end.

Acceptance criteria:
- [ ] **Links shared FROM the app work.** When a user shares any link the app generates (invite links, profile links, venue links, plan/event links, post links), the recipient opening that link lands in the right place: the app if installed (deep link), or a correct web fallback / app-store prompt if not. Test on both iOS and web, and test the link both when the app is installed and when it isn't.
- [ ] **Deep links / universal links are configured correctly** (Associated Domains / apple-app-site-association for iOS; correct web routes) so links open the intended screen, not the home screen or a 404.
- [ ] Invite links correctly attribute/connect the inviter and invitee (the invite landing flow works, and accepting creates the right relationship).
- [ ] **DM-ing a post to someone within the app works.** Sharing a post (or venue/plan/profile) to another user via in-app DM delivers correctly: the recipient receives it in their thread, the shared item renders properly (preview/thumbnail/link), and tapping it opens the correct content. Test with real content and multiple recipients / group chats.
- [ ] Share-to-DM respects privacy (you can't share content the recipient shouldn't be able to see; shared location/venue content honors the same rules as elsewhere).
- [ ] Native share sheet (share to Messages, etc.) works from iOS where offered.
- [ ] All shared links and previews render correctly (Open Graph / link preview metadata present so links look good when pasted into iMessage, etc.).

---

## 19. Native / iOS / App Store readiness (P0 for launch)

Acceptance criteria:
- [ ] Fresh `npm run build` + `npx cap sync ios` produces a working device build.
- [ ] Background location behaves correctly and per Apple's rules (and passes the force-quit walk test in §4).
- [ ] All native permissions have correct Info.plist usage strings (location Always/WhenInUse, camera, photo library, notifications, contacts).
- [ ] Push notifications work on a real device via a TestFlight build (not just simulator).
- [ ] App icon, launch screen, and metadata are set.
- [ ] No console errors/warnings that indicate real problems on device.
- [ ] App survives backgrounding/foregrounding, low battery, and network transitions without corrupt state.
- [ ] App Store review readiness: privacy nutrition labels, location-usage justification, account-deletion path (Apple requires it), age rating, and any UGC moderation requirements met.
- [ ] TestFlight beta round completed with real testers before public release.

---

## 20. Known open items to fold in (from prior work)

The contractor should treat these as scoped tasks, not surprises:
- [ ] **Schema drift reconciliation** — dump live DB schema, reconcile into migrations, regenerate `types.ts`. (§1)
- [ ] **`profiles` grant redesign** — table-level SELECT revoke + safe column allowlist. (§4)
- [ ] **APNs key rotation** — rotate the exposed signing key. (§10)
- [ ] **Hide/unhide + status realtime propagation** — some changes only reach other users on refetch; add server-side "poke" so they propagate live cross-device.
- [ ] **Verify recently-added features end-to-end:** map "locate me," unified search, venue clustering, consolidated Profile/Tonight status card, Plans page hierarchy redesign, check-in modal redesign — several were built but not fully device-verified.
- [ ] **Complete the location-privacy verification checklist** (block, stop-sharing propagation, TBD visibility, private-party address, GPS resurrection) on a real device.
- [ ] **Remove all user-facing demo-mode access** and confirm no demo content reaches real users. (§15)
- [ ] **Confirm auth is phone-OTP only** and remove any lingering email/OAuth code paths. (§3)
- [ ] **Build/verify the leaderboard hybrid weighting (tunable 75/25 baseline/live), the "feels dynamic" behavior, and admin venue-management tooling; seed NYC + LA venue lists.** (§7)
- [ ] **Device-fit & spacing pass** on all iPhone sizes (no bottom gaps, safe areas respected) + **web layout parity** with no weird formatting. (§18A)
- [ ] **Verify all sharing paths:** links shared from the app open correctly (deep links), and DM-ing a post/content to another user in-app works end-to-end. (§18B)
- [ ] **Verify "last night's recap" (Morning After)** generates correctly, respects privacy, and shows the right state for users with/without a night out. (§13A)
- [ ] **Verify phone-number onboarding is smooth** end-to-end on a real device — fast, clear, auto-fill code where supported, graceful errors. (§3)

---

## 21. Deliverables

The contractor should deliver:
1. **A completed version of this checklist** with each item marked pass/fail + notes and links to the fix commits.
2. **A written test report** covering the device matrix used (iOS versions/devices), what was tested, and residual known issues with severities.
3. **All fixes committed** to version control with clear messages, and **all DB changes captured as migrations** (no uncommitted dashboard SQL).
4. **A regenerated, accurate `types.ts`** and a reconciled migration history matching the live DB.
5. **A short "operations" note:** how to deploy web + iOS, how to rotate secrets, how the cron/edge functions work, and any manual steps.
6. **A security sign-off** summarizing the RLS/edge-function/secrets audit results.

---

## 22. Acceptance / definition of done

The engagement is complete when:
- All **P0** items pass on a real iOS device and against the live database.
- All **P1** items pass or have an agreed, documented fast-follow plan.
- The location-privacy model is independently re-verified with two real accounts, including the physical force-quit walk test.
- A full RLS + secrets security pass is signed off.
- A TestFlight beta has run with no P0/P1 issues outstanding.
- The DB drift is reconciled and the repo is the source of truth going forward.

---

## 23. Suggested engagement structure (for pricing/scheduling)

A reasonable way to structure the contract:
- **Milestone 1 — Audit & baseline:** environment setup, DB reconciliation, security/RLS audit, written findings with severities. (Fixed fee or 1–2 weeks.)
- **Milestone 2 — P0 fixes & privacy verification:** close all launch-blockers, verify the privacy model on-device. (Payment on the completed §4 + §16 checklists.)
- **Milestone 3 — Feature QA & polish:** work through §3–§18, fix P1s. (Payment on the completed per-area checklists.)
- **Milestone 4 — Native/App Store + TestFlight:** §19, ship a beta, final sign-off. (Payment on TestFlight acceptance.)

Tie payments to **completed, verified checklist sections**, not hours or "it's done" — the acceptance criteria above are the contract.

---

*This document was generated as a launch-readiness scope of work. Adjust P0/P1/P2 assignments and milestone structure to your budget and timeline.*
