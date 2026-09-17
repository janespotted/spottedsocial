# Spotted — Development Notes

## Camera Architecture

Camera is a **native UIKit fullscreen modal** (`SpottedCameraPlugin.swift` + `.m`).

- **Triggered from JS** via `openSpottedCamera()` in `src/lib/spotted-camera.ts`
- **Returns** captured media to caller via promise: `{ type, file, previewUrl }`
- **All UI is native UIKit** — buttons, gestures, animations are in Swift, not React
- **Features:** tap-to-photo, hold-to-record (14s max), flip button + double-tap flip with fade, flash toggle (off/on), close/dismiss
- **Gallery button** is intentionally removed (was a stub). Gallery access is via the web fallback in `PostMediaPicker`.

### Files

| File | Purpose |
|------|---------|
| `ios/App/App/SpottedCameraPlugin.swift` | Native camera VC + Capacitor plugin bridge |
| `ios/App/App/SpottedCameraPlugin.m` | Obj-C plugin registration |
| `src/lib/spotted-camera.ts` | JS wrapper — calls native plugin, converts file path to File+URL |
| `src/components/PostMediaPicker.tsx` | Entry point — calls `openSpottedCamera()` on native, shows gallery fallback on web |

### Do NOT reintroduce

- `@capgo/camera-preview` — removed, was the old webview-overlay camera
- `WebViewTransparencyPlugin` — removed, was only needed for webview-overlay approach
- `CameraTest.tsx` / `/camera-test` route — removed, was the old camera page

### React Native app (`mobile/`)

The RN app has its own camera, unrelated to the Capacitor plugin above: `mobile/src/components/spotted-camera.tsx` on **react-native-vision-camera 5** (Nitro; peers `react-native-nitro-modules`, `react-native-nitro-image`). One session with a photo output and a video output (`enablePersistentRecorder: true` so a lens flip mid-recording keeps recording); photo via `capturePhotoToFile`, video via `createRecorder({ maxDuration: 14 })`. VisionCamera 5 has no Expo config plugin — camera/microphone strings live in `app.json` → `ios.infoPlist` and `android.permissions`. `/create-post` is one full-screen route with two modes (camera → composer) so Retake keeps the draft; `lib/post-media.ts` holds the shared media type and the system library picker. `expo-media-library/legacy` provides the last-item thumbnail only when photo access was already granted (it never prompts). Do not reintroduce `expo-camera`.

Publishing goes through `mobile/src/lib/publish-post.ts`, not `supabase.storage.upload()`: the file is streamed to the Storage REST endpoint by `expo-file-system`'s `File.upload()` (native URLSession, real byte progress, a 14 s video never enters JS memory), then the row is inserted. A failure after the upload succeeded throws `PublishError` carrying the storage path so Retry skips the re-upload; Close during an upload aborts it and keeps the draft. Success switches `/create-post` to a third mode (`components/post-shared.tsx`) that renders the post from the local capture with "View in feed" / "Done". Before upload, `lib/media-prep.ts` downsizes photos to 1920 px on the long edge as JPEG and computes pixel size + a ThumbHash on react-native-nitro-image (already linked as a VisionCamera peer — no extra native module); they land in `posts.media_width/media_height/media_hash`. Videos pass through (capped at 1080p / 6 Mbps in the camera). The feed signs a whole page in one `createSignedUrls` call (`resolvePostImageUrls`), and `PostCard` renders with `cacheKey` = storage path (signed URLs differ every mint, so caching by URL re-downloads on every refresh), `placeholder={{ thumbhash }}` and `recyclingKey`. Uploads are sent with `cache-control: max-age=31536000, immutable` — paths are unique per upload, never reuse one. Supabase image transformations are enabled on the project but unused; the stored size already matches the feed.

## Controls and tokens (mobile)

`mobile/src/lib/theme.ts` is the token layer: `NEON` / `PURPLE` / `INK` / `INK_LIGHT` and the three control states (`control.ordinary` quiet translucent, `control.selected` the one neon treatment, `control.disabled` dimmed) with matching `controlTint`. Import from there; do not re-declare colours in a screen (the older screens still do — sweep them under feedback §9, don't add new ones). Round icon controls are `components/icon-button.tsx` (required accessibility label, `badge` = unread count or `true` for a "something is set" dot). Every tab header's right-hand cluster is `components/header-actions.tsx`: search, bell (ordinary control, neon unread count — never a permanent fill) and the `StatusPill` (the S mark plus Out / TBD / In, or "Status" when tonight is unanswered — e.g. daytime after the 5 AM reset; that word is pending client confirmation; opens `/check-in`; it replaced a bare logo that secretly opened the status flow). The Home FAB is labelled per view: "Post" (camera) on Newsfeed, "Plan" on Plans. Map recenter goes to the user's own fix via `getCurrentPosition()` (never prompts), keeps the current zoom and never touches filters; the filter button shows selected + dot while `isDefaultMapFilters()` is false and the sheet offers Reset.

Map filters (`lib/map-filters.ts`) are three independent viewing choices: `people` (the same three tiers and values as the sharing audience, progressive via `peopleFilterIncludes()`), `showVenues` (boolean), and `venueType`. They never touch `profiles.location_sharing_level`; the sheet says so. Legend and person badges use Close Friend / Friend / Mutual (a person's relationship); "Friends + Mutuals" is only ever an audience or viewing selection. The venue card (`app/venue.tsx`) is a `formSheet` with `fitToContents` like every other sheet — on iOS the sheet content is absolutely positioned with no bottom, so a `flex-1` root has no height (empty sheet) and a root-level ScrollView breaks the content measurement (tall sheet, content pinned to its bottom). The card is therefore a plain content-sized View; only the More Info section scrolls, inside a bounded `maxHeight`, the same nested pattern the check-in sheet uses. The invite picker replaces the content at a fixed height rather than overlaying it, and the route's `contentStyle` background matches the card so the safe-area strip below it isn't a lighter band. Opening it from a pin pans at the same zoom (bottom padding = half the window) and remembers the camera, and the map's `useFocusEffect` restores it when the sheet is dismissed. Who's-here leads the card when friends are present; Save/Saved is labelled with rollback on failure; a failed load shows Retry and stays dismissible.

## Brand (mobile) — from `mobile/Spotted_Brand_Bible_Latest_Yellow_Lime.pdf` (Sept 2026)

- The S mark is a vector: `components/spotted-mark.tsx` (path traced from the bible's flat icon, fill NEON). The old `spotted-s-logo.png` was pure yellow with a glow and is gone — don't reintroduce a raster S. App icon, splash and Android adaptive icons are the same S on `#110a24` (`assets/images/`, generated from `spotted-mark-icon.svg`); the previous ones were Expo's template assets. Icon/splash changes need `npx expo prebuild` to show.
- Two accents only: lime (`NEON`) for status and primary actions, violet for interaction. No green — "out" rings/dots and Meet Up use lime. Violet fills that carry white text use `VIOLET_FILL` (#8040aa, the bible's Action Violet, 6.5:1) — white on `PURPLE` (#a855f7) is 3.96:1 and fails; keep `PURPLE` for icons, rings and outlines.
- Native tab bar: `LAVENDER` active, `MIST` inactive. Montserrat 300/400/500/600 only — there is no `font-sans-bold` class (it silently falls back to the system font).
- Open with the client: the bible's hex values (Midnight #1A1229, Lime #DDFE2A, Card Plum #251B37…) were sampled from screenshots of this app, so the code values are the source; and its proposed type scale (supporting copy 14–15pt, control labels 15–16pt) is larger than the app's 12pt norm.

## Layout rules (mobile, feedback §9)

- Every form sheet is opaque: `SHEET_CONTENT_STYLE` in `app/_layout.tsx` (INK_LIGHT). Do not set a sheet's `contentStyle` back to transparent — with no root background the neon glows bled through.
- Tab screens clear the native tab bar with content padding, not per-item hacks: Home `pb-36` (tab bar + home indicator + the Post FAB), Messages/Leaderboard `pb-28`, Profile `pb-32`, Plans `pb-28`. Nothing floats over the last rows — Biggest Mover is the leaderboard's `ListFooterComponent`.
- Text tiers: the faintest allowed body/label text is `text-white/45`; `/55`–`/60` is the normal secondary tier. Never reintroduce `/25`–`/40` for readable text (decorative only).
- Text buttons use `min-h-*`, not `h-*`, so Dynamic Type can grow them; the header wordmark is a fixed 20pt on every tab (`numberOfLines={1}`, capped at 1.3× scaling) and never animates.
- Colour constants come from `lib/theme.ts` everywhere now (the §6 sweep is done); a screen must not declare its own NEON / PURPLE / INK.
- Counts pluralise: "1 spot", "1 friend".

## Empty, error and status-aware states (mobile)

`components/empty-state.tsx` is the one empty state (`EmptyState`: icon, title naming the situation, why, the action that fixes it) and the one error state (`ErrorState` with Retry). Loading is never an empty state and an error is never an empty feed: Feed (`useFeed().isError`), Plans, Messages, Friends and Venue all branch loading → error → empty → content. `lib/add-friends.ts` gives every empty list the same Add friends (contacts) / Invite friends pair; `AddFriendsRow` is the compact version on the Friends screen. Empty copy is by situation: no friends → add some; friends but nobody sharing → say so; and Plans never tells a user who is Out or TBD to set a status (it acknowledges it). Viewer-status rules live in `hooks/use-friends-out.ts`: a viewer who answered "No" gets friends' names with venues withheld (`venuesWithheld`, matching the map's hidden pins) plus an "Update status" path; a TBD viewer gets `components/friends-out-banner.tsx` on Feed and Plans the moment friends go Out (realtime via the existing night_statuses subscription). The map shows "Nothing matches your filters / Clear filters" when filters hide everything; contacts-denied offers Search and Invite and re-runs the match when access is granted in Settings.

## Video posts on Mux (mobile)

Videos never touch Storage. `publishPost` calls the `mux-create-upload` edge function (signed-in user only; Mux credentials stay server-side), PUTs the file to the returned direct-upload URL with the same native upload task, and inserts the post with `mux_upload_id` + `mux_status='preparing'` and `image_url = null`. Mux then calls `mux-webhook` (no Supabase JWT — verified by the `Mux-Signature` HMAC against `MUX_WEBHOOK_SECRET`): `video.upload.asset_created` records `mux_asset_id`, `video.asset.ready` records `mux_playback_id`, `mux_status='ready'` and the pixel size, errors set `mux_status='errored'`. The feed subscribes to post UPDATEs so the "Video is processing…" tile turns into a player without a refresh.

- Playback is `lib/mux.ts`: HLS `stream.mux.com/{id}.m3u8` (expo-video / AVPlayer; WKWebView on the web app via `resolvePostImageUrls`), poster `image.mux.com/{id}/thumbnail.jpg` cropped 4:5. Playback ids are public: the post row is what RLS protects, and every Mux asset is deleted with its row. **Deletion is queue-based, not inline:** triggers on `posts` (migration `20260917100000`) copy `mux_asset_id` into `public.mux_asset_deletions` whenever a row is deleted or its asset id changes — by the SQL `nightly_reset()`, a user delete, or the account-delete cascade — and the `mux-cleanup` edge function (no JWT; it can only delete already-queued assets) drains the queue, invoked hourly by pg_cron via pg_net (`invoke_mux_cleanup()`). `delete-account` still deletes directly as well; a 404 counts as gone. Do not add Mux calls to the SQL reset and do not rely on `daily-cleanup` (manual-only, Eastern-only) for it.
- Assets are created with `video_quality: 'basic'`, `max_resolution_tier: '1080p'`, `normalize_audio`, `passthrough = user id`. No static renditions; nothing needs an MP4.
- Secrets: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (a Mux access token with Video read+write), `MUX_WEBHOOK_SECRET` (from the webhook's settings in the Mux dashboard). Webhook URL: `https://<project>.supabase.co/functions/v1/mux-webhook`. Until the secrets are set, `mux-create-upload` answers 503 and the composer shows "Video uploads are not available right now." with Retry; photos are unaffected.
- Legacy video rows (Storage path in `image_url`, `media_type='video'`) still play from a signed URL; `PostCard` branches on `mux_status`/`mux_playback_id` being present.

## Header Patterns

- **Newsfeed & Plans**: Both have a collapsing header. The page title and tagline collapse on scroll. The "Spotted" wordmark, city pill, search, notification bell, and S logo are anchored and do not animate. The Newsfeed/Plans tab toggle is inside the sticky header.
- **Other pages** (Map, Chat, Profile, Leaderboard): Do not have collapsing headers. Static headers only.
- Implementation is inline in `src/pages/Home.tsx`, not a shared component. If a second page needs the same pattern, do not extract a component until that second page is built — duplicate the pattern first, abstract on the third use.
- Padding and sizing of the expanded header have not been intentionally changed and should not be changed without an explicit task.

## Capacitor Keyboard Behavior (CRITICAL)

The Capacitor config uses `resize: 'native'`. This is the most important fact about keyboard handling in this app:

**WITH RESIZE: NATIVE:**
- iOS automatically shrinks the webview when keyboard opens
- The visible viewport (`window.innerHeight`) decreases by the keyboard's height
- `position: fixed; bottom: 0` already sits above the keyboard automatically — no JS needed
- **DO NOT** add `keyboardHeight` to `bottom` values. This double-counts and pushes elements up by an extra keyboard's worth of pixels.

**CORRECT pattern** for elements that should sit above the keyboard:
```css
style={{ bottom: 0, paddingBottom: 'env(safe-area-inset-bottom)' }}
```

**WRONG pattern** (causes double-count bug):
```css
style={{ bottom: keyboardHeight }}
```

`useKeyboardAware` hook STILL HAS valid uses (e.g., conditional rendering, animations triggered by keyboard state, hiding/showing the FAB). Just don't use its `keyboardHeight` value to position fixed elements relative to the bottom.

This bug has been "fixed" multiple times in this codebase. The underlying issue was always double-counting: native resize + JS offset. This pattern is now documented to prevent regression.

### Sheet keyboard-lift pattern (CommentsSheet)

`CommentsSheet.tsx` is the one sanctioned exception: because the native webview resize lands ~300–450ms AFTER the keyboard animation finishes, the sheet lifts itself via an imperative transform on `keyboardWillShow`, then swaps to real layout (transform → 0, no animation) the frame the viewport resize lands. Two values in that file were measured frame-by-frame from a device screen recording — do not change them casually:

- **Easing/duration:** iOS keyboard motion ≈ easeOutExpo, `cubic-bezier(0.16, 1, 0.3, 1)` over **400ms**. A shorter/snappier curve makes the sheet race ahead of the keyboard (~80% of travel in 2 frames) — this reads as the "keyboard jump" bug.
- **Lift target:** the input bar's `max(env(safe-area-inset-bottom), 12px)` padding collapses 34pt → 12pt at the exact frame the webview resizes (env() → 0). The lift math must bake in that 22pt shrink, or the swap frame shows a 12pt snap.

## "Tonight" and the 5 AM reset (mobile)

A night runs 5:00 AM → 5:00 AM **in the profile city's time zone** (NYC = America/New_York, LA = America/Los_Angeles). Never the device zone. Everyone in a city shares one night, so content expires at the same moment for all of them and travel or a wrong device clock cannot split a user from their friends.

- **Client:** `mobile/src/lib/tonight.ts` is the only place that computes the boundary. Every expiry (`night_statuses`, `checkins`, `posts`, `yap_messages`) and every "is this from tonight" check goes through it. `time-context.ts` is re-exports only. Do not add a `getHours() < 5` anywhere.
- **Server:** `supabase/functions/daily-cleanup` trusts a row's own `expires_at` (stamped by the client in the right zone) and judges it against `now()`. Rows without an expiry use the earliest supported reset (5 AM Eastern) as a conservative cutoff. The cron runs after each city's reset (10:10 and 13:10 UTC) and every step is idempotent.
- **Answered tonight:** the opening "Are you out tonight?" prompt treats any unexpired `night_statuses` row as answered, including `status='home'`. `stopSharing`/`stayIn` therefore write a real `expires_at`. Never revert `home` rows to `expires_at: null` — that reads as "never asked" and re-prompts.
- **Status values:** `out` (Yes), `planning` (TBD), `home` (No), `off` (Stop sharing: still out tonight, but hidden — venue, pin and check-in dropped). Friend-facing readers key on `out`/`planning` only, so `off` and `home` are invisible to others. "Stop sharing" ≠ "No": the first keeps the user's own answer as out; the second records staying in.
- **One status query:** `hooks/use-own-night-status.ts` is the only reader of the user's own row (Plans, Profile, Map, Messages, arrival prompts, the gate). After any status write call `invalidateNightStatusQueries(queryClient)`. Do not add another `night_statuses` self-query.
- **Audience:** three tiers in order — Close Friends / Friends / Friends + Mutuals (`lib/audience.ts`). One selector for everything: the `/audience` form sheet via `openAudiencePicker()`, shown as a compact "Visible to X ▾" row (`components/audience-row.tsx`). Confirming never publishes. Live-status audience lives in `profiles.location_sharing_level` (default Friends, persisted only on explicit change); post audience is a separate per-device preference. Private Party exact pin is Close Friends only, enforced in the database: `party_locations` (RLS: self or close friend who may see the host) holds the exact spot; a trigger on `night_statuses` moves coordinates there and nulls them on the row, and a trigger on `profiles` nulls `last_known_lat/lng` while the user is at a party. Every writer (mobile, web, edge functions, seeds) is covered — never store party coordinates anywhere else, and never start background GPS for a party. Map pins for parties come from `party_locations` (no row → no pin).
- **Profile out flag:** `goOutAtVenue` must set `profiles.is_out = true` (+ coordinates for venues) — friends' maps filter on it via `get_profiles_safe`. `profiles.show_read_receipts` exists (added Sept 2026, default true); regenerate `database.types.ts` with `npx supabase gen types typescript --linked --schema public` after schema changes.

## Demo Mode (CRITICAL SAFETY RULES)

Demo mode seeds 24 fake users + content for testing. Real and demo data coexist in the same tables, distinguished by `is_demo` column.

**SAFETY RULES:**

1. Demo venue names MUST be distinct from real venues. All demo venues use a `(Demo)` suffix (e.g., "Academy LA (Demo)"). NEVER use `onConflict:'name'` upsert for venues — this can promote real venues to demo and cause data loss when demo is cleared.

2. Friendship clears must use IN clauses scoped to demo user IDs on both sides. The current logic is correct: only delete where `user_id` OR `friend_id` is in the demo set.

3. Before any clear operation, the function logs counts of preserved real data. This is a sanity check — if those counts drop unexpectedly, that signals data loss.

4. Demo data expiry is set to 30 days from seeding (not 5am tonight). This ensures demo content persists across sessions.

5. The seed function creates friendships between the seeding user and all 24 demo users. If the user has no real friends, demo mode is the only way to populate their friend graph for testing.

**Past bugs to prevent regression:**
- Venue upsert promoting real venues to demo (fixed: distinct names with "(Demo)" suffix)
- Demo clear deleting all friendships (fixed: scoped to demo IDs only)
- Demo night_statuses expiring at 5am (fixed: 30-day expiry)
- Seed never running after clear, leaving empty state (user must explicitly re-seed from Demo Settings)
