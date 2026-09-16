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
export async function resolvePostImageUrl(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  if (imageUrl.includes('/storage/v1/object/public/post-images/')) {
    const path = imageUrl.split('/storage/v1/object/public/post-images/')[1];
    if (path) {
      const { data } = await supabase.storage.from('post-images').createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    }
  }
  if (!imageUrl.startsWith('http')) {
    const { data } = await supabase.storage.from('post-images').createSignedUrl(imageUrl, 3600);
    return data?.signedUrl ?? null;
  }
  return imageUrl;
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
