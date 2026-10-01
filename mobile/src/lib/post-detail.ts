import { useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import { makeMutable, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { FeedPost } from './posts';

/**
 * The post detail transition (POST-DETAIL-PLAN.md).
 *
 * One feed card's media is *moved* (re-parented, not remounted) into the
 * detail screen's PortalHost and animated from its feed frame to its detail
 * frame, so a playing video keeps playing. This store is the contract
 * between the card, the feed list and the detail screen:
 *
 * - `postId` / `hostName`: which card teleports its media, and where to.
 *   Every card subscribes only to "am I the one?" (granular selectors, so
 *   a transition re-renders one row, not the list).
 * - `origin`: the media's frame in window coordinates when tapped. The
 *   detail host is an absolute-fill view over the whole window, so window
 *   coordinates are host coordinates.
 * - `progress`: 0 = feed frame, 1 = detail frame. A shared value, so the
 *   fly runs on the UI thread and every piece of chrome can read it.
 * - `post` / `isLiked` and the feed's own like/delete callbacks: handed
 *   over by the card so likes on the detail hit the feed's state directly
 *   and nothing is refetched. The card keeps these fresh while active.
 *
 * Same request-store shape as lib/tag-picker.ts and lib/audience.ts.
 */

export type PostDetailPhase = 'idle' | 'opening' | 'open' | 'closing';

/**
 * Instagram has two comment surfaces and we match both:
 * - `reel`: tapping a video opens the full-screen reel; its media is
 *   teleported in and flown; comments are a sheet over the reel.
 * - `sheet`: the comment icon on any feed post opens the comment sheet over
 *   the FEED — nothing teleports, the feed stays visible behind the
 *   transparent modal and scrolls so the post sits above the sheet.
 */
export type PostDetailMode = 'reel' | 'sheet';

/** The PortalHost name inside app/post-detail.tsx. */
export const POST_DETAIL_HOST = 'post-detail';

/** Media frame at tap time, window coordinates. */
export interface PostDetailOrigin {
  y: number;
  width: number;
  height: number;
}

export interface PostDetailState {
  phase: PostDetailPhase;
  mode: PostDetailMode;
  postId: string | null;
  /** Portal destination for the active card; undefined = render in place. */
  hostName: typeof POST_DETAIL_HOST | undefined;
  origin: PostDetailOrigin | null;
  post: FeedPost | null;
  isLiked: boolean;
  /** Open with the comment sheet already raised. */
  openComments: boolean;
  toggleLike: ((postId: string) => void) | null;
  deletePost: ((postId: string) => void) | null;
}

const IDLE: PostDetailState = {
  phase: 'idle',
  mode: 'reel',
  postId: null,
  hostName: undefined,
  origin: null,
  post: null,
  isLiked: false,
  openComments: false,
  toggleLike: null,
  deletePost: null,
};

let state: PostDetailState = IDLE;
const listeners = new Set<() => void>();
const closedListeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(patch: Partial<PostDetailState>) {
  state = { ...state, ...patch };
  emit();
}

/**
 * 0 → the media sits at `origin` (its feed frame); 1 → at its detail
 * frame. Module-level so the card's fly style, the detail's background and
 * chrome, and the sheet all read the same value without prop drilling.
 */
export const postDetailProgress = makeMutable(0);

// The recipe's spring: heavy and critically damped, so the media settles
// without overshoot (an overshooting video looks broken, not playful).
const SPRING = { mass: 3, damping: 500, stiffness: 1000 } as const;

export interface OpenPostDetailArgs {
  post: FeedPost;
  isLiked: boolean;
  mode: PostDetailMode;
  /** Reel only: null when nothing on screen can be teleported (the detail renders its own media). */
  origin?: PostDetailOrigin | null;
  toggleLike?: (postId: string) => void;
  deletePost?: (postId: string) => void;
}

/**
 * The feed registers how to bring a post into view above the comment
 * sheet (sheet mode scrolls the list behind the transparent modal, as
 * Instagram does). Null when no feed is mounted.
 */
let feedScroller: ((postId: string) => void) | null = null;
export function registerFeedScroller(fn: ((postId: string) => void) | null): void {
  feedScroller = fn;
}

/**
 * Called by a feed card. Records the hand-over and presents the detail.
 * Reel mode: after measuring its media the card's Portal is pointed at the
 * detail host (children render locally until that host mounts, which is
 * where they already are, so nothing moves yet); the detail starts the fly
 * once its host exists (playPostDetailOpen). Sheet mode: nothing teleports;
 * the feed scrolls the post up under the sheet.
 */
export function openPostDetail(args: OpenPostDetailArgs): void {
  if (state.phase !== 'idle') return;
  const origin = args.mode === 'reel' ? (args.origin ?? null) : null;
  postDetailProgress.value = origin ? 0 : 1;
  set({
    phase: 'opening',
    mode: args.mode,
    postId: args.post.id,
    hostName: origin ? POST_DETAIL_HOST : undefined,
    origin,
    post: args.post,
    isLiked: args.isLiked,
    openComments: args.mode === 'sheet',
    toggleLike: args.toggleLike ?? null,
    deletePost: args.deletePost ?? null,
  });
  router.push({ pathname: '/post-detail', params: { postId: args.post.id } });
  if (args.mode === 'sheet') feedScroller?.(args.post.id);
}

/** The detail screen calls this once its PortalHost is mounted. */
export function playPostDetailOpen(): void {
  if (state.phase !== 'opening') return;
  const finish = () => {
    if (state.phase === 'opening') set({ phase: 'open' });
  };
  postDetailProgress.value = withSpring(1, SPRING, (finished) => {
    'worklet';
    if (finished) scheduleOnRN(finish);
  });
}

/**
 * Reverse the fly, then send the media home and dismiss. The Portal's
 * hostName is cleared BEFORE router.back() so the media returns to its
 * card while the host still exists: the host unmounting would also pull
 * it home (lifecycle rule), but after the modal is gone, which snaps.
 */
export function closePostDetail(opts: { animated?: boolean } = {}): void {
  if (state.phase !== 'open' && state.phase !== 'opening') return;
  const finish = () => {
    state = IDLE;
    emit();
    router.back();
    for (const l of closedListeners) l();
  };
  if (opts.animated === false || !state.origin) {
    set({ phase: 'closing' });
    finish();
    return;
  }
  set({ phase: 'closing' });
  postDetailProgress.value = withSpring(0, SPRING, (finished) => {
    'worklet';
    if (finished) scheduleOnRN(finish);
  });
}

/**
 * The active card calls this on every render so the detail never shows a
 * stale like count or heart: the feed's optimistic updates land on the
 * card first, and this forwards them.
 */
export function syncPostDetail(post: FeedPost, isLiked: boolean): void {
  if (state.postId !== post.id) return;
  if (state.post === post && state.isLiked === isLiked) return;
  set({ post, isLiked });
}

/** The feed defers data changes while this is true (POST-DETAIL-PLAN.md §4.5). */
export function isPostDetailActive(): boolean {
  return state.phase !== 'idle';
}

/** Fires after the detail has fully closed — the feed replays deferred work here. */
export function onPostDetailClosed(listener: () => void): () => void {
  closedListeners.add(listener);
  return () => closedListeners.delete(listener);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Select a slice of the transition state. Return primitives or stable
 * references from the selector — useSyncExternalStore compares with
 * Object.is and will loop on a fresh object every call.
 */
export function usePostDetail<T>(selector: (s: PostDetailState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function getPostDetailState(): PostDetailState {
  return state;
}

/** Identity changes must not run navigation callbacks from the previous account. */
export function resetPostDetail(): void {
  state = IDLE;
  feedScroller = null;
  postDetailProgress.value = 0;
  emit();
}
