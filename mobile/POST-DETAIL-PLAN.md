# Post detail with shared media transition and comment sheet

**Status:** plan approved for implementation, Sept 21 2026. Replaces client feedback v2 §10 ("comment composer"), which described the wrong feature.

## 1. What the client actually asked for

Instagram-style behaviour on posts in the Newsfeed:

1. Tap a **video post** in the feed → a new **post detail screen** opens. The video does not restart or flash: it visibly *moves* from its place in the feed to its place on the detail screen, still playing.
2. On the detail screen, **comments are a bottom sheet**. Dragging the sheet up **scales the video container down** so the video stays visible above the sheet; dragging down grows it back. The video and the sheet move together, frame by frame (the client's reference: how Google Maps shrinks the map as the card rises).
3. Going back reverses the move: the video flies back into its feed card, still playing.

Reference implementation supplied by the client: [react-native-teleport](https://github.com/kirillzyusko/react-native-teleport), specifically its [Instagram example](https://github.com/kirillzyusko/react-native-teleport/tree/main/example/src/screens/Instagram) and the recipe doc *Building Instagram-like Transitions*.

The current `/comments` route is a full-screen modal with no post visible and no transition. It is retired by this work.

## 2. How the reference works (and what we take from it)

`react-native-teleport` re-parents **native views** without unmounting the React tree. One `<Portal hostName=…>` wraps the video in the feed card. Changing `hostName` moves the *same* native view into a named `<PortalHost>` elsewhere — playback, refs and animation values survive. Rules that matter (from the library's lifecycle guide):

- No host with that name yet → children render locally and migrate the moment the host mounts.
- Host unmounts → children snap back to the Portal's own position, intact.
- Portal unmounts → children unmount, wherever they are.
- The Portal reserves **no** space at its origin; the feed card must keep a fixed-size placeholder or the list reflows.

The recipe's flow: feed `Portal` → root-level "overlay" host while a Reanimated spring animates `height`/`translateY` from the measured card frame to full screen → on completion re-teleport into a host inside the Reels screen. The Reels screen is a `transparentModal` with `animation: 'none'` so the feed stays visible underneath and the library drives the animation itself. A Zustand store holds `progress` (a `makeMutable` shared value), the tapped post id, the measured `y`, and the current destination.

**Requirements the library imposes on us:** New Architecture only (we are on RN 0.86 / Expo 57, new arch by default); native code, so a **dev-client rebuild** (`npx expo prebuild -p ios && npx expo run:ios`). Not in TestFlight build 48; a new build is needed on Asif's phone to test. Version 1.2.2 (Sept 10 2026) supports RN 0.87; no Expo config plugin needed, autolinks.

## 3. Design decisions (where we deviate from the recipe, and why)

### 3.1 One hop, not two: no root overlay host

The recipe teleports feed → root overlay → Reels host. It needs the middle hop because its destination is inside a snapping ScrollView pager and because Reels is full screen so nothing has to fade in behind the flying video.

Ours is different, and the two-hop layout has a trap on iOS: a `transparentModal` is a UIKit modal presentation **above** the root React view, so a root-level overlay host sits *below* the modal. Our detail screen must fade an opaque background in while the video is still flying (the media is 4:5, not full screen, so the feed has to disappear behind it). A video flying in a root overlay would be covered by that background.

So: **the feed Portal teleports straight into a full-screen `PortalHost` inside the detail screen.** The detail's JSX order is background (fades in with `progress`) → media host (absolute fill, the video flies inside it) → chrome (header, actions, caption; fade in) → comment sheet. Everything layers correctly on both platforms with no platform branching. If the host mounts a frame after `hostName` changes, the media renders locally for that frame, which is exactly where it already is, so nothing visible happens.

### 3.2 The detail media is 4:5 under a header, not a full-screen reel

The client said "details screen", not "reel viewer", and our clips are shot 4:5. The fly-in is therefore a pure vertical translate at constant size, which is the most robust transition there is (no size animation of a live `AVPlayer` layer). Full-bleed is listed as an open question in §10; the scale plumbing built for the sheet makes it a small change later.

### 3.3 The sheet is `@gorhom/bottom-sheet`, driving the media scale via `animatedPosition`

Already a dependency (v5.2.14, peer-compatible with Reanimated 4), unused until now. It gives snap points, the pan gesture, a scrollable list that hands off to the pan correctly, keyboard behaviour, and two shared values (`animatedPosition` = sheet top in px, `animatedIndex`) that we read on the UI thread to scale the media. Hand-rolling this is the higher-risk path.

Media scale = clamp((sheetTop − mediaTop − gap) / mediaHeight, MIN_SCALE, 1), anchored top-centre (RN scales about the centre, so translateY is corrected by −mediaHeight·(1−scale)/2). At the collapsed snap the media is full size; at the top snap it is a small thumbnail above the comments. Continuous during the drag.

### 3.4 State lives in a tiny external store, not Zustand

Same granular subscriptions the recipe wants (each feed row subscribes only to "am I the active post?"), via `useSyncExternalStore` with a selector. Matches the codebase's existing request-store pattern (`lib/tag-picker.ts`, `lib/friend-card.ts`) and adds no dependency. `progress` is a module-level `makeMutable(0)`.

### 3.5 The feed hands its post to the detail; deep links fetch

Tapping a card passes the `FeedPost`, its like state, and the feed's `toggleLike`/`deletePost` callbacks through the store, so likes on the detail update the feed instantly and nothing is refetched. While active, the card keeps pushing its latest `post`/`isLiked` into the store on each render so the two views can never disagree.

When the detail is opened by a push tap or a cold link (nothing on screen to teleport), it fetches the post itself, renders its own media inline in the host, and skips the fly (instant `progress = 1`). Missing/expired → `ExpiredState` ("This post expired at 5am"), which also closes the §4 gap for post deep links.

## 4. Architecture

### 4.1 Transition store — `lib/post-detail.ts`

```ts
type Phase = 'idle' | 'opening' | 'open' | 'closing';
interface PostDetailState {
  phase: Phase;
  postId: string | null;              // the card whose media is teleported
  hostName: 'post-detail' | undefined;// Portal destination for that card
  origin: { y: number; height: number } | null; // media frame, window coords
  post: FeedPost | null;              // handed over by the card, kept fresh
  isLiked: boolean;
  toggleLike?: (id: string) => void;
  deletePost?: (id: string) => void;
  openComments: boolean;              // start with the sheet expanded
}
export const progress = makeMutable(0);         // 0 feed frame, 1 detail frame
export function openPostDetail(args): void      // measure → set store → router.push
export function closePostDetail(): void         // phase closing → spring 0 → teleport home → router.back()
export function usePostDetail<T>(selector): T   // useSyncExternalStore + selector
export function isPostDetailActive(): boolean   // for useFeed's freeze
export function onPostDetailClosed(fn): () => void
```

Open sequence: card `measureInWindow` → store `{phase:'opening', postId, origin, post, hostName:'post-detail', …}` → `router.push({ pathname: '/post-detail', params: { postId } })` → detail mounts its host (children migrate) → detail effect springs `progress` 0→1 (`{ mass: 3, damping: 500, stiffness: 1000 }`, the recipe's config; tune on device) → completion `scheduleOnRN` → `phase: 'open'`.

Close sequence: `phase: 'closing'` → sheet collapses → spring `progress` 1→0 → completion: `hostName: undefined` (media returns to the card), `phase: 'idle'`, `router.back()`. The teleport home happens **before** the modal unmounts so the return is animated, not snapped; the lifecycle rules make the wrong order safe (host unmount pulls children home) but not pretty.

### 4.2 Feed card — `components/post-media.tsx` (extracted from `post-card.tsx`)

`PostVideo`, `VideoPending`, and the media block move into `PostMedia`. The card keeps a **fixed `width × width·1.25` placeholder View** (it already has one) and inside it:

```tsx
<Portal hostName={isActive ? hostName : undefined}>
  <Animated.View style={[{ width, height: mediaH }, flyStyle]}>{media}</Animated.View>
</Portal>
```

`flyStyle` is the identity unless `isActive`, then `top: interpolate(progress, [0,1], [origin.y, detailMediaTop])` inside the detail host's absolute-fill coordinate space (window coords, since the modal covers the full window). The Portal is **always** present on every card: switching from "no Portal" to "Portal" would remount the video and restart it.

Tap wiring: media tap on a **video** → `openPostDetail({ openComments: false })`. Comment icon / "View all N comments" on **any** post → `openPostDetail({ openComments: true })` (photos teleport by the same mechanism; expo-image is a plain native view). Media tap on a photo stays a no-op, as on Instagram.

### 4.3 Detail route — `app/post-detail.tsx`

Registered in `app/_layout.tsx` inside the session-protected group, like `sent-confirmation`:

```tsx
<Stack.Screen name="post-detail" options={{
  presentation: 'transparentModal', animation: 'none', gestureEnabled: false,
  contentStyle: { backgroundColor: 'transparent' },
}} />
```

Layout (JSX order is z-order):

1. `Animated.View` absolute fill, `backgroundColor: INK`, `opacity: progress`.
2. `<PortalHost name="post-detail" style={absoluteFill} />` — the media host. In fallback mode (no teleported card) an inline `PostMedia` is rendered here instead.
3. Chrome, `opacity: progress`: header (back chevron, avatar, name, `@venue`, time · until 5am, overflow menu) at the top; actions row + likes + caption + tags positioned at `top = mediaTop + mediaH·scale + gap` (animated), fading out as scale drops below ~0.7.
4. `CommentSheet` (below).

Back: header chevron and Android hardware back both call `closePostDetail()`. `useDismissKeyboardOnLeave()` as on every input screen.

### 4.4 Comment sheet — `components/comment-sheet.tsx`

`BottomSheet` (inline, not modal) with:

- `snapPoints = [COLLAPSED, '55%', '88%']`, `index = openComments ? 1 : 0`, `enablePanDownToClose={false}`, `animatedPosition` passed in from the detail for the media scale.
- Collapsed state shows the handle plus one line "N comments · Add a comment…"; tapping it snaps to 1.
- Content: `BottomSheetFlatList` of `CommentRow` (extracted from `comments.tsx`; avatar/name open the friend card, heart toggles a like with rollback). Comment lists are short; FlatList is fine and hands its scroll to the sheet's pan correctly.
- `footerComponent`: the composer — quick-emoji row (posts the emoji as a comment, as today), `BottomSheetTextInput`, send button. `keyboardBehavior="interactive"`, `keyboardBlurBehavior="restore"`, `android_keyboardInputMode="adjustResize"`. A sent comment dismisses the keyboard (`dismissKeyboardNow`, addendum v3 §8.2) and bumps the count via `notifyCommentAdded`.
- Data/actions in `hooks/use-post-comments.ts` (the query, send, like toggle, validation), lifted verbatim from `comments.tsx`.
- Wrapped in an `Animated.View` with `opacity: progress` and `pointerEvents` none until `phase === 'open'`, so it fades with the rest of the chrome and can't be grabbed mid-flight.

### 4.5 Feed integration — `(home)/index.tsx`, `hooks/use-feed.ts`

Two things must be true while the detail is open, or the teleported media can be pulled out from under the detail screen:

- **The list must not scroll.** `scrollEnabled={phase === 'idle'}` (the recipe locks both screens the same way).
- **The list's data must not change.** `LegendList` has `recycleItems`: a component instance can be handed a different `item` when rows shift. A realtime prepend or a refresh while the detail is open could give the teleported row another post, and `useVideoPlayer` would swap the source on the detail screen. So `useFeed` **defers** `refresh`, `loadMore`, and the realtime INSERT/DELETE/UPDATE handlers while `isPostDetailActive()`, queues them, and replays them on `onPostDetailClosed`. The `onCommentAdded` count bump is a same-id map and stays live.

Viewport pausing is unaffected: nothing scrolls, so the active video stays "visible" and keeps playing through the transition.

### 4.6 Post hydration — `lib/posts.ts`

`fetchPage` in `use-feed.ts` inlines ~50 lines that turn `posts` rows into `FeedPost`s (profiles, live like/comment counts, signed URLs, tags). Extract `hydratePosts(rows, userId): Promise<{ posts: FeedPost[]; likedByMe: Set<string> }>` and add `fetchPostById(id, userId)` on top of it for the deep-link path. `useFeed.fetchPage` calls the same function, so the two never drift.

### 4.7 Root — `app/_layout.tsx`

`PortalProvider` wraps `RootNavigator` (required by the library). No root overlay host (§3.1).

## 5. Phases, gates and estimates

| Phase | Work | Gate / done when | Est. |
|---|---|---|---|
| **0 Spike** | Install `react-native-teleport`, prebuild, rebuild dev client, add `PortalProvider`. Teleport one feed video into a throwaway `transparentModal` host and back. | (a) playback continues without restart or audio glitch, (b) the mute button inside the teleported view still responds, (c) open/close ×20 with no crash or stranded view, (d) poster overlay and `expo-image` behave the same. **If (a) fails see §7.** | 0.5 d |
| **1 Foundation** | Transition store; `PostMedia` extraction; `hydratePosts`/`fetchPostById`; card tap wiring; feed scroll lock + deferred refresh. | Typecheck + lint clean; feed unchanged visually; tapping a video logs the measured frame. | 0.5 d |
| **2 Detail + fly** | `post-detail` route, background/host/chrome, spring in and out, back handling, deep-link fallback with `ExpiredState`. | Video flies feed → detail → feed, still playing, on simulator and device. Likes on the detail update the feed. | 1 d |
| **3 Comment sheet** | `CommentSheet`, `use-post-comments`, `CommentRow`, composer + keyboard, media scale coupled to `animatedPosition`, retire `/comments`, typed routes regenerated. | Sheet drag scales the media continuously; comment send/like parity with the old screen; keyboard docks and dismisses correctly (device). | 1 d |
| **4 Polish** | Swipe-down on the media to dismiss (drives `progress` interactively, snaps on release); haptics on open; `useReducedMotion` → crossfade instead of fly; a11y labels; Dynamic Type on the header. | Reviewed on device with Asif. | 0.5 d |
| **5 Verify** | Add a section to `DEVICE-TEST-PLAN.md`; two-device pass. | Checklist signed off. | 0.5 d |

Total ≈ 4 days. Phase 0 is a hard gate: nothing else starts until the spike passes or a fallback is chosen.

## 6. Files

**New**
- `lib/post-detail.ts` — store, `progress`, open/close, hooks
- `app/post-detail.tsx` — the route
- `components/post-media.tsx` — `PostMedia`, `PostVideo`, `VideoPending`, the Portal wrapper
- `components/comment-sheet.tsx`, `components/comment-row.tsx`
- `hooks/use-post-comments.ts`

**Modified**
- `app/_layout.tsx` — `PortalProvider`, `post-detail` screen, remove `comments`
- `components/post-card.tsx` — use `PostMedia`; tap wiring; push live `post`/`isLiked` to the store while active
- `app/(tabs)/(home)/index.tsx` — `scrollEnabled` from the store
- `hooks/use-feed.ts` — `hydratePosts`; deferral while the detail is open
- `lib/posts.ts` — `hydratePosts`, `fetchPostById`
- `package.json` — `react-native-teleport`
- `DEVICE-TEST-PLAN.md` — new section
- `CLAUDE.md` — a short "Post detail and the media transition" section with the rules from §3 and §4.5

**Deleted**
- `app/comments.tsx` (logic lifted into the hook and the sheet)

## 7. Risks and fallbacks

| Risk | Likelihood | Mitigation / fallback |
|---|---|---|
| expo-video's iOS view (an `AVPlayerViewController` view) misbehaves when its superview changes: black frame, playback pause, or a UIKit warning. | Medium — the recipe uses react-native-video with a texture view; expo-video is untested with re-parenting. | **Spike gate.** Fallback A: teleport the container but mount a *second* `VideoView` on the *same* `player` in the detail (expo-video explicitly supports one player in several views) and crossfade. Fallback B: no teleport — the detail creates its own player, seeks to `player.currentTime`, and a poster snapshot flies then crossfades to the live view. Both keep the "moves without restarting" feel. |
| `LegendList` recycling hands the teleported row a different item. | Medium if data changes; near zero once refresh is deferred and scroll is locked. | §4.5. If it still bites, `recycleItems={false}` on the feed (rows unmount instead of being reused; the window is 3–5 large cards, cost is negligible). |
| The post is deleted or expires while the detail is open. | Low | Deferred handlers apply on close; the detail keeps showing what it has. Deep-link path shows `ExpiredState`. |
| gorhom sheet keyboard handling vs `react-native-keyboard-controller`'s `KeyboardProvider`. | Low–medium | They coexist in many apps; gorhom listens to RN `Keyboard` events. If the footer misplaces under the keyboard on device, drive the footer offset from keyboard-controller's `useReanimatedKeyboardAnimation` instead of gorhom's `keyboardBehavior`. |
| Modal over native tabs. | Low | `sent-confirmation` already presents a `transparentModal` over `NativeTabs` with `animation: 'none'`; same options. |
| Typed routes don't know `/post-detail` until regenerated. | Certain, trivial | `npx expo customize` isn't needed; typegen runs on `expo start`/`tsc` via the router plugin — run it before typecheck. |
| Android | Deferred | Branch is iOS-only (`feat/ios-native`). The design has no iOS-only branch, but Android is not tested in this work. |

## 8. Native build steps

```bash
cd mobile
npx expo install react-native-teleport
npx expo prebuild -p ios
npx expo run:ios            # simulator dev client
# device: npx expo run:ios --device, or an EAS development build
```

TestFlight build 48 does not contain the native module; the feature is invisible there until the next build.

## 9. Verification (to be appended to DEVICE-TEST-PLAN.md)

1. Feed with ≥3 video posts. Tap a video mid-playback → it moves to the detail without restarting, sound state preserved; the feed fades behind it.
2. Back chevron → it flies back to its card, still playing; the feed scrolls again.
3. Comment icon on a photo post → detail opens with the sheet at the middle snap; drag up and down slowly: the media scales continuously and never jumps.
4. Type a comment, send → appears in the list, count on the feed card increments, keyboard dismisses.
5. Like on the detail → heart and count on the feed card match on return.
6. Open/close 20 times fast; scroll the feed after: no black tiles, no duplicated videos, no crash.
7. Kill the app, tap a `post_like` push → Activity (unchanged); open a post link with an expired id → "This post expired at 5am".
8. Reduced Motion on → crossfade, no fly.

## 10. Open questions for the client (none block the build)

1. **Full-bleed video on the detail?** Current plan: same 4:5 as the feed under a header. A full-screen reel-style viewer is a different screen; say so if that is what was meant.
2. **Photo posts:** tapping the photo itself does nothing (Instagram). Comments open the same detail with the sheet up. Confirm.
3. **Detail as a pager** (swipe to the next post, like Reels)? Not planned; "details screen" reads as one post.
