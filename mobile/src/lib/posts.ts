import type { Database } from './database.types';
import { isDemoMode } from './demo-mode';
import { fetchTagsForPosts, type TaggedFriend } from './post-tags';
import { buildProfileMap, fetchProfilesSafe } from './profiles';
import { supabase } from './supabase';
import { getNightResetIso } from './tonight';

/**
 * Posts (like stories) die at the nightly reset — the same 5 AM
 * profile-city boundary as statuses and check-ins (see lib/tonight.ts).
 */
export function getPostExpiry(city?: string | null): string {
  return getNightResetIso(city);
}

export interface FeedPost {
  id: string;
  user_id: string;
  text: string;
  image_url: string | null;
  /** Stable storage path (expo-image cache key); null for external URLs. */
  media_path: string | null;
  media_type: string | null;
  media_width: number | null;
  media_height: number | null;
  /** ThumbHash placeholder, base64. */
  media_hash: string | null;
  /** Mux video: playback id once encoded; status preparing | ready | errored. */
  mux_playback_id: string | null;
  mux_status: string | null;
  venue_name: string | null;
  venue_id: string | null;
  created_at: string;
  comments_count: number;
  likes_count: number;
  display_name: string;
  avatar_url: string | null;
  /** Friends tagged in the post (addendum v3 §9.3); RLS keeps these inside the audience. */
  tags: TaggedFriend[];
}

type PostRow = Database['public']['Tables']['posts']['Row'];

/**
 * Turn raw `posts` rows into what the feed renders: author from
 * get_profiles_safe, live like/comment counts, signed media URLs (one
 * Storage call for the batch) and tags. The feed page and the post detail's
 * deep-link path both go through here, so they can never disagree.
 *
 * `likedByMe` comes back separately because the feed keeps its own liked
 * set for optimistic toggles.
 */
export async function hydratePosts(
  rows: PostRow[],
  userId: string
): Promise<{ posts: FeedPost[]; likedByMe: Set<string> }> {
  const likedByMe = new Set<string>();
  if (rows.length === 0) return { posts: [], likedByMe };

  const postIds = rows.map((p) => p.id);
  // The likes_count/comments_count columns are NOT maintained by triggers
  // in the production DB (the trigger migration was never applied), so we
  // count the actual rows and add them to the column value. The column is
  // only nonzero for seeded demo posts; live activity exists solely as
  // post_likes/post_comments rows.
  const [profiles, { data: likeRows }, { data: commentRows }, imageUrls, tagsByPost] =
    await Promise.all([
      fetchProfilesSafe(),
      supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds),
      supabase.from('post_comments').select('post_id').in('post_id', postIds),
      // Uploaded posts store a private-bucket path in image_url — swap for a
      // signed URL. Full http URLs (demo content) pass through untouched.
      resolvePostImageUrls(rows.map((p) => p.image_url)),
      fetchTagsForPosts(postIds),
    ]);
  const profileMap = buildProfileMap(profiles);

  const likeCounts = new Map<string, number>();
  const commentCounts = new Map<string, number>();
  for (const l of likeRows ?? []) {
    likeCounts.set(l.post_id, (likeCounts.get(l.post_id) ?? 0) + 1);
    if (l.user_id === userId) likedByMe.add(l.post_id);
  }
  for (const c of commentRows ?? []) {
    commentCounts.set(c.post_id, (commentCounts.get(c.post_id) ?? 0) + 1);
  }

  const posts: FeedPost[] = rows.map((p) => ({
    id: p.id,
    user_id: p.user_id,
    text: p.text ?? '',
    image_url: p.image_url ? (imageUrls.get(p.image_url) ?? null) : null,
    media_path: postImageStoragePath(p.image_url),
    media_type: p.media_type,
    media_width: p.media_width,
    media_height: p.media_height,
    media_hash: p.media_hash,
    mux_playback_id: p.mux_playback_id,
    mux_status: p.mux_status,
    venue_name: p.venue_name,
    venue_id: p.venue_id,
    created_at: p.created_at ?? new Date().toISOString(),
    comments_count: (p.comments_count ?? 0) + (commentCounts.get(p.id) ?? 0),
    likes_count: (p.likes_count ?? 0) + (likeCounts.get(p.id) ?? 0),
    display_name: profileMap.get(p.user_id)?.display_name ?? 'Friend',
    avatar_url: profileMap.get(p.user_id)?.avatar_url ?? null,
    tags: tagsByPost.get(p.id) ?? [],
  }));
  return { posts, likedByMe };
}

/**
 * One post for the detail screen when nothing on screen handed it over (a
 * push tap, a cold link). null when it is gone or expired — the caller
 * shows "This post expired at 5am". Demo posts only in demo mode, like the
 * feed.
 */
export async function fetchPostById(
  postId: string,
  userId: string
): Promise<{ post: FeedPost; isLiked: boolean } | null> {
  let query = supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .gt('expires_at', new Date().toISOString());
  if (!isDemoMode()) query = query.eq('is_demo', false);
  const { data: row } = await query.maybeSingle();
  if (!row) return null;
  const { posts, likedByMe } = await hydratePosts([row], userId);
  const post = posts[0];
  return post ? { post, isLiked: likedByMe.has(post.id) } : null;
}

/**
 * The post-images bucket is private: uploaded posts store a storage path
 * (`userId/timestamp.jpg`) in image_url, which must be exchanged for a signed
 * URL to render. Demo/seed posts store full http URLs and pass through as-is.
 * Port of the web resolvePostImageUrl (storage-utils.ts).
 */
const SIGNED_URL_TTL = 6 * 3600;
const PUBLIC_PREFIX = '/storage/v1/object/public/post-images/';

/**
 * Storage path behind an image_url value, or null for external http URLs.
 * Also the stable cache key: signed URLs carry a fresh token every time
 * they are minted, so caching by URL would re-download on every feed load.
 */
export function postImageStoragePath(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.includes(PUBLIC_PREFIX)) return imageUrl.split(PUBLIC_PREFIX)[1] || null;
  if (!imageUrl.startsWith('http')) return imageUrl;
  return null;
}

export async function resolvePostImageUrl(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  const path = postImageStoragePath(imageUrl);
  if (!path) return imageUrl;
  const { data } = await supabase.storage.from('post-images').createSignedUrl(path, SIGNED_URL_TTL);
  return data?.signedUrl ?? null;
}

/**
 * Batch form for lists: one Storage request for a whole feed page instead
 * of one per post. Returns a map keyed by the original image_url value.
 */
export async function resolvePostImageUrls(
  imageUrls: ReadonlyArray<string | null>
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const paths: string[] = [];
  for (const url of imageUrls) {
    if (!url || result.has(url)) continue;
    const path = postImageStoragePath(url);
    if (!path) {
      result.set(url, url);
      continue;
    }
    result.set(url, null);
    paths.push(path);
  }
  if (paths.length === 0) return result;
  const { data } = await supabase.storage.from('post-images').createSignedUrls(paths, SIGNED_URL_TTL);
  const byPath = new Map((data ?? []).map((row) => [row.path, row.signedUrl ?? null]));
  for (const url of imageUrls) {
    if (!url) continue;
    const path = postImageStoragePath(url);
    if (path) result.set(url, byPath.get(path) ?? null);
  }
  return result;
}

/**
 * Feed invalidation: the composer calls invalidateFeed() after a successful
 * post; mounted feed hooks subscribe and refresh immediately. Deliberately
 * not navigation/focus-based — native tabs don't reliably re-emit focus when
 * a root-level modal dismisses.
 */
const feedListeners = new Set<() => void>();

export function onFeedInvalidated(listener: () => void): () => void {
  feedListeners.add(listener);
  return () => feedListeners.delete(listener);
}

export function invalidateFeed(): void {
  for (const listener of feedListeners) listener();
}

/** Comment-added events: the comments modal notifies, the feed bumps counts. */
const commentListeners = new Set<(postId: string) => void>();

export function onCommentAdded(listener: (postId: string) => void): () => void {
  commentListeners.add(listener);
  return () => commentListeners.delete(listener);
}

export function notifyCommentAdded(postId: string): void {
  for (const listener of commentListeners) listener(postId);
}
