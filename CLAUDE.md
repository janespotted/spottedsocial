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

## Post detail (reel) and the media transition (mobile)

`mobile/POST-DETAIL-PLAN.md` is the design. One route, two Instagram surfaces (`mode` in the store): the **comment icon** on any post opens the comment sheet *over the feed* (nothing teleports; the feed scrolls the post above the sheet via `registerFeedScroller`); tapping a **video** opens `app/post-detail.tsx` as an Instagram-style full-screen reel, and the card's media **moves there without remounting**: `react-native-teleport` re-parents the native view (`<Portal>` in the card → `<PortalHost name="post-detail">` on the detail), so a playing video keeps playing. `lib/post-detail.ts` is the contract (phase, active post id, the measured origin frame, a module-level `progress` shared value, and the feed's own like/delete callbacks handed over so the detail never refetches). Rules that keep it working:

- **The card never animates.** Its media child is `100% × 100%` of whatever contains it; the card keeps a fixed 4:5 placeholder (a Portal reserves no space); the **detail animates its host wrapper** from the origin frame to the window. The two coordinate systems agree at progress 0, so whichever frame the native migration lands on, nothing jumps.
- **The Portal is always mounted on every card.** Adding it only when active remounts the video and restarts it.
- **While a detail is open the feed is frozen**: the list is `scrollEnabled={false}` and `useFeed` defers `refresh`, `loadMore` and the realtime handlers, replaying them on close. `LegendList` recycles row components, so a data change would hand the teleported row a different post and swap the video on the detail. Do not remove either guard.
- **Close order:** clear the Portal's `hostName` (media returns to the card) *before* `router.back()` unmounts the host; the reverse (host unmount pulls children home) is safe but snaps.
- The comment sheet is a **native** sheet, `@lodev09/react-native-true-sheet` (`components/comment-sheet.tsx`; `@gorhom/bottom-sheet` was tried and rejected on feel — don't reintroduce it). Its `ReanimatedTrueSheetProvider` shared value `animatedPosition` drives the reel's tuck on the UI thread. **Dismiss the native sheet before the route** (`close()` awaits `dismiss()`): it is a view controller presented on top of the `transparentModal`, and popping the route under it blanks the screen. Comments logic lives in `hooks/use-post-comments.ts`; the old `/comments` modal is gone. Deep links (no card on screen) fetch via `fetchPostById` and render inline media with no fly; a missing post shows `ExpiredState`.
- The library is Fabric-only native code: `npx expo prebuild -p ios && npx expo run:ios` after installing; TestFlight build 48 predates it.

## Demo mode and the Lahore test city (mobile)

`lib/demo-mode.ts` is a saved per-device preference, **off by default in every build** (SOW §15 — demo content must never reach a real user by accident), hydrated in the root layout so a session survives a restart. It is a runtime switch rather than `__DEV__` because the developer is Lahore-based and needs demo content on a TestFlight build, while the same binary shows Jane the US cities untouched. Read it with `isDemoMode()` in plain modules and `useDemoMode()` where UI must re-render; the Settings switch invalidates every query on change.

Lahore (`lhr`) is a hidden city, **not `is_demo` data**: 20 real venues with true coordinates (migration `20260918150000`) across Gulberg / MM Alam / DHA / Fort Road / Johar Town / Model Town, with `is_demo = false`. Marking them demo looked right and broke exactly what needs testing — every venue query hard-codes `.eq('is_demo', false)` (map, check-in search, search screen) **and so does the `find_nearest_venue()` SQL function**, so venue detection and arrival prompts could never match a Lahore spot (migration `20260918160000` undid it). The isolation is the `city` column plus a picker that hides Lahore unless demo mode is on; `is_demo` keeps its real meaning, seeded fake people. **Asia/Karachi is UTC+5 with no DST**, so its 5 AM is 00:00 UTC — `night_start_at()` knows the zone and `nightly-reset-lhr` runs at 00:10 UTC. Lahore is hidden from the onboarding picker unless demo mode is on, and Settings gains a City row (demo mode only) so an existing account can move without redoing onboarding. Adding another city means five places: `night_start_at()` + a cron slot, `cityToTimezone()`, `CITY_NEIGHBORHOODS`, `CITY_CENTERS`/`ALL_CITY_IDS`/`getCityLabel`, and the onboarding list.

## Tagging friends in posts (mobile)

`post_tags` (migration `20260918120000`) is a pointer, never a grant: its SELECT policy mirrors `posts`' own visibility rule, so tagging someone outside the audience shows them nothing, and INSERT requires the author to be tagging a direct friend. Rows cascade with the post, so the 5 AM reset takes them and there is no separate expiry. `lib/post-tags.ts` owns the writes and the feed read (`fetchTagsForPosts`, one query per page); the `post_tag` notification is created by the `push_post_tag` trigger on `post_tags` (migration `20260922205151`), in the same transaction as the tag, never by the client; `send-push` must keep that type in `VALID_NOTIFICATION_TYPES` or the push is silently rejected. The picker is `app/tag-friends.tsx` behind `lib/tag-picker.ts` (the same request-store pattern as the audience sheet, because a form sheet is a separate screen) — and like every `fitToContents` sheet it holds NO scroll view: the list is capped at `MAX_ROWS` and search narrows it.

## Controls and tokens (mobile)

`mobile/src/lib/theme.ts` is the token layer: `NEON` / `PURPLE` / `INK` / `INK_LIGHT` and the three control states (`control.ordinary` quiet translucent, `control.selected` the one neon treatment, `control.disabled` dimmed) with matching `controlTint`. Import from there; do not re-declare colours in a screen (the older screens still do — sweep them under feedback §9, don't add new ones). Round icon controls are `components/icon-button.tsx` (required accessibility label, `badge` = unread count or `true` for a "something is set" dot). Every tab header's right-hand cluster is `components/header-actions.tsx`: search, bell (ordinary control, neon unread count — never a permanent fill) and the `StatusPill` (the S mark plus Out / TBD / In, or "Status" when tonight is unanswered — e.g. daytime after the 5 AM reset; that word is pending client confirmation; opens `/check-in`; it replaced a bare logo that secretly opened the status flow). The Home FAB is always "Post" (camera) now that Home is the Newsfeed only — see "Plans in the Chat tab, Yap parked". Map recenter goes to the user's own fix via `getCurrentPosition()` (never prompts), keeps the current zoom and never touches filters; the filter button shows selected + dot while `isDefaultMapFilters()` is false and the sheet offers Reset.

Friend ID card (addendum v3 §1): `app/friend-card.tsx` is the ONE presentation — a `formSheet` that self-fetches from `userId` — and `components/friend-id-card.tsx` (`FriendCardBody`) is its body; the map's pins open it too (`openFriendCard`), there is no Dialog variant any more. The map remembers the camera before opening any sheet (`rememberCamera`/`panAboveSheet`) and `useFocusEffect` restores it and clears the highlighted pin. The card restores the original build's controls: the relationship badge is a `DropdownMenu` (Close Friend / Friend / Remove friend… with an Undo toast), the overflow holds Hide my location (`location_hidden`), Report and Block, the mutual tier shows shared friends (`get_mutual_friends_with`) and Add Friend, the status line has the TBD / In-for-the-night variants, and the action row is a large Meet Up (or Make plans when they are not out) plus a separate Chat. `lib/friend-relationship.ts` holds those writers; call `invalidateFriendGraph()` after any. Success states are `app/sent-confirmation.tsx` (full-screen: "Invites Sent!" / "You sent a Meet Up Request to X!", `components/confetti.tsx`, Undo = delete the notification rows, Chat): venue invites (`sendVenueInvites` returns the ids) and meet-ups (`sendMeetUp` returns a result and never alerts on success) both route there after their sheet closes. Confetti fires only on those cards, never on the friend card. Toasts: `lib/toast.ts showToast()` + `components/toast-host.tsx` at the root — show one AFTER a sheet has closed, or the sheet covers it. Menus are `components/dropdown-menu.tsx` (anchored, on the app surface; optional title and avatars) — not `ActionSheetIOS` for anything the original build styled. The map shell mirrors the original: wordmark + city badge, bell + `StatusPill`, then the search bar, the Friends chip (a shortcut over the same filter store: no venues, no mutuals) and the filter control; `components/friends-out-pill.tsx` ("N out · M TBD", roster grouped by ring) sits bottom-left on Map and Home; recenter and legend bottom-right; venue pins are the `venue-pin.png` teardrop symbol, clusters stop at zoom 14; a group pin opens the "Friends at [Venue]" avatar list before any card.

Map filters (`lib/map-filters.ts`) are three independent viewing choices: `people` (the same three tiers and values as the sharing audience, progressive via `peopleFilterIncludes()`), `showVenues` (boolean), and `venueType`. They never touch `profiles.location_sharing_level`; the sheet says so. Legend and person badges use Close Friend / Friend / Mutual (a person's relationship); "Friends + Mutuals" is only ever an audience or viewing selection. The venue card (`app/venue.tsx`) is a `formSheet` with `fitToContents` like every other sheet — on iOS the sheet content is absolutely positioned with no bottom, so a `flex-1` root has no height (empty sheet) and a root-level ScrollView breaks the content measurement (tall sheet, content pinned to its bottom). The card is therefore a plain content-sized View, and so is More Info — it is **open by default** and holds no scroller of its own. Three ways to break this sheet, all seen on device: a root-level ScrollView, fixed detents, and a nested ScrollView whose content arrives after the sheet was measured (the hours query and Trending Nearby landed a second later and painted over the card above them). Nothing inside may scroll; keep late-arriving lists bounded by their query instead (Trending Nearby is `.limit(4)`). The invite picker replaces the content at a fixed height rather than overlaying it, and the route's `contentStyle` background matches the card so the safe-area strip below it isn't a lighter band. Opening it from a pin pans at the same zoom (bottom padding = half the window) and remembers the camera, and the map's `useFocusEffect` restores it when the sheet is dismissed. Who's-here leads the card when friends are present; Save/Saved is labelled with rollback on failure; a failed load shows Retry and stays dismissible.

## Brand (mobile) — from `mobile/Spotted_Brand_Bible_Latest_Yellow_Lime.pdf` (Sept 2026)

- The S mark is a vector: `components/spotted-mark.tsx` (path traced from the bible's flat icon, fill NEON). The old `spotted-s-logo.png` was pure yellow and is gone — don't reintroduce a raster S in the UI. **The icon glows** (client's approved asset, WhatsApp Sept 15): app icon, splash, Android foreground and favicon are that same vector with a neon halo on Plum `#3E244F`, generated by the scripted renderer — the glow is composited (CoreImage blur under the crisp mark), because an SVG `feGaussianBlur` is dropped by the AppKit rasteriser. `SpottedMark` takes `glow`, on by default at ≥40pt and off for the 18pt header pill where a halo muddies the glyph. Splash `imageWidth` is 200 to suit the halo. **The splash background must stay `#110a24`, the app's own `--background`** — the JS root paints that behind the splash while `preventAutoHideAsync` holds it, so any other colour (Plum was tried) shows as a colour change when the splash fades and reads as a second splash. Plum belongs to the icon, which never meets another surface. **"Two splashes" has one other cause, and it is the glow:** the launch storyboard draws the compiled `@3x` asset while the held splash is re-drawn by the JS module from `assets/images/splash-icon.png` scaled to `imageWidth`. A halo that is a few pixels wide at 200pt vanishes in that reduction, so the first S looks flat and the second glows. Keep `splash-icon.png` a TIGHT crop (S at ~70% of a 512px canvas, glow radius ~3%) so the halo survives scaling — do not reuse the 1024px icon artwork, where the S is small and the glow disappears. Icon/splash changes need `npx expo prebuild` to show.
- Two accents only: lime (`NEON`) for status and primary actions, violet for interaction. No green — "out" rings/dots and Meet Up use lime. Violet fills that carry white text use `VIOLET_FILL` (#8040aa, the bible's Action Violet, 6.5:1) — white on `PURPLE` (#a855f7) is 3.96:1 and fails; keep `PURPLE` for icons, rings and outlines.
- Native tab bar: `LAVENDER` active, `MIST` inactive. Montserrat 300/400/500/600 only — there is no `font-sans-bold` class (it silently falls back to the system font).
- **Tab icons track the original Capacitor app's lucide set** in `src/components/BottomNav.tsx`, which is the design of record: Home `house` ← `Home`, Leaderboard `chart.bar.xaxis` ← `BarChart3`, Map `mappin.and.ellipse` ← `MapPin`, Chat `text.bubble` ← `MessageSquare`, Profile the S mark. Do not swap in a "better" symbol (a `trophy` for the chart, a `location` arrow for the pin) — that reads as an improvement and is actually a design regression; ask first.
- Where a `.fill` counterpart exists the icon is `sf={{ default, selected }}` so it gains weight on selection; where SF ships none (`mappin.and.ellipse`, `chart.bar.xaxis`) it is a bare `sf` string and shifts tint only. **Never invent a `.fill` name to make the set uniform** — an unavailable symbol renders blank with no error. Verify every name against `node_modules/sf-symbols-typescript` before using it. `sf` overrides `src` on iOS, so an icon takes one or the other, not both.
- The web conveyed the active tab with lime `#d4ff00` + a drop-shadow glow and no shape change; the RN port uses `LAVENDER` active / `MIST` inactive per the brand bible. The web also rendered Map larger as a visual centre (`isCenter`), which a native tab bar cannot do — that is lost, not forgotten.
- Profile's icon is the Spotted S as a **PNG** (`assets/images/tab-profile*.png`), not `<SpottedMark />`. `NativeTabs`' `Icon.src` is typed `React.ReactElement`, but at runtime `convertComponentSrcToImageSource` accepts **only** expo-router's `VectorIcon` or promise-loader elements; any other element is dropped with a console warning and **the tab renders with no icon at all**. Passing the SVG component was tried and silently produced an empty tab. Regenerate the PNGs with `mobile/scripts/render-tab-icon.sh`, which reads `VIEW_BOX`/`PATH` straight out of `components/spotted-mark.tsx` so the tab mark cannot drift from the in-app mark.
- A tab-bar icon is a **template**: iOS discards the artwork's colour and re-tints it from the bar (MIST inactive, LAVENDER active), so only the alpha channel matters and the source art is white on transparent. The S cannot be lime in the tab bar — don't "fix" it back, and don't add a background or glow to the asset.
- Open with the client: the bible's hex values (Midnight #1A1229, Lime #DDFE2A, Card Plum #251B37…) were sampled from screenshots of this app, so the code values are the source; and its proposed type scale (supporting copy 14–15pt, control labels 15–16pt) is larger than the app's 12pt norm.

## Plans in the Chat tab, Yap parked (mobile, client change Sept 2026)

Home is the **Newsfeed only** — no Newsfeed/Plans toggle, no `FeedMode`, and the FAB is always "Post". Plans moved wholesale into the **Chat tab**, which now reads **Plans | DMs**: `messages.tsx` renders the same `<PlansFeed>` component, so there is one Plans implementation, not two. Its `onScroll` prop is a no-op at both call sites now.

**Home's header is static** (mobile — this does NOT describe the web `src/pages/Home.tsx`, which keeps its collapsing header). The collapse existed to make room for the two-item Newsfeed/Plans title; once Plans left, the remaining word named the only screen Home could be, so the title row and the collapse went together. `scrollProgress`, the `onScroll` measuring handler and its jitter guard are gone with it. Home now matches Map / Profile / Leaderboard: wordmark + city pill + `HeaderActions`, fixed height, one hairline border. The wordmark was always anchored and is untouched.

Plans no longer carries its own **Out / TBD / Staying In** segmented control — setting a status is the header `StatusPill`'s job, and Plans was a second control for the same row. Plans still *reads* the status (`isUserOut` / `isUserPlanning` drive the TBD banner and the situation-specific empty states, which keep their "Update status" action into `/check-in`). `handleStayIn` and `handleJoinPlanning` lost their only callers and sit commented out with their now-dead `Alert` / `Haptics` / `stayIn` imports.

**Yap is parked, not removed.** The client may want it back, so nothing was deleted: `lib/yap.ts`, `app/yap-thread.tsx`, `YapRow`, the directory query, `YapIllustration` and the venue card's Yap button all still exist. The switch is `YAP_ENABLED = false` in `messages.tsx`, which gates the tab, the `yap-directory` query and the `yap_messages` realtime subscription; the venue shortcut and the Yap onboarding screen are commented out with a note pointing back here. To restore: flip the flag, uncomment those two blocks, and set the tour's `TOTAL` back to 8 (Yap was step 6; Leaderboard and Find-friends shifted down to 6 and 7).

Do not "clean up" the parked Yap code as dead — it is deliberate.

## Layout rules (mobile, feedback §9)

- Every form sheet is opaque: `SHEET_CONTENT_STYLE` in `app/_layout.tsx` (INK_LIGHT). Do not set a sheet's `contentStyle` back to transparent — with no root background the neon glows bled through.
- Tab screens clear the native tab bar with content padding, not per-item hacks: Home `pb-36` (tab bar + home indicator + the Post FAB), Messages/Leaderboard `pb-28`, Profile `pb-32`, Plans `pb-28`. Nothing floats over the last rows — Biggest Mover is the leaderboard's `ListFooterComponent`.
- **This applies to every screen nested inside a tab group, not just the tab's own index.** A pushed route in `(profile)` still renders under the same native tab bar, so Settings, Blocked & Hidden and Friends each need `pb-32` too — `py-5` or `pb-10` leaves the last row unreachable. This was a real bug: Settings' last row is Delete Account, which Apple requires be reachable in-app, and it sat under the tab bar invisible and untappable. When adding a screen under a tab group, set the bottom padding from this rule before anything else.
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

## Notifications are created by the database (mobile)

Friend out / TBD / arrival (including automatic GPS venue changes), friend request and accept, DM, post like / comment / tag and private-party alerts are inserted by triggers and RPCs in the same transaction as the action that causes them (migrations `20260922205151`, `20260922213920`). Rows go through `push_outbox` and are delivered by `process-push-queue`. Do not add client-side `create_notification` / `send-push` calls for these types. That is the double-send and privacy-bypass path this replaced. `mobile/NIGHTLIFE-NOTIFICATIONS.md` and `mobile/PUSH-RELEASE-CHECKLIST.md` have the details.

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
