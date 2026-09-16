import { supabase } from './supabase';
import { getNightResetIso } from './tonight';

/**
 * Posts (like stories) die at the nightly reset — the same 5 AM
 * profile-city boundary as statuses and check-ins (see lib/tonight.ts).
 */
export function getPostExpiry(city?: string | null): string {
  return getNightResetIso(city);
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
