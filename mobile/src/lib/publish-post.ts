import { File } from 'expo-file-system';
import type { Audience } from './audience';
import { prepareForUpload, type PreparedMedia } from './media-prep';
import type { CapturedMedia } from './post-media';
import { getPostExpiry, invalidateFeed } from './posts';
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase';
import { getActiveCity } from './tonight';

const BUCKET = 'post-images';

/** What the composer needs to draw the published post without re-fetching it. */
export interface PublishedPost {
  id: string;
  created_at: string;
  text: string;
  venue_name: string | null;
  venue_id: string | null;
  visibility: Audience;
  /** Local capture — no signed URL round trip for the success screen. */
  media: CapturedMedia | null;
}

export type PublishPhase = 'preparing' | 'uploading' | 'publishing';

export interface PublishInput {
  userId: string;
  media: CapturedMedia | null;
  text: string;
  venueName: string | null;
  venueId: string | null;
  visibility: Audience;
  /** Storage path from a previous attempt whose upload succeeded — skips re-upload. */
  uploadedPath?: string | null;
  onPhase?: (phase: PublishPhase) => void;
  /** 0..1, upload bytes only. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface PublishResult {
  post: PublishedPost;
  uploadedPath: string | null;
}

export class PublishError extends Error {
  constructor(
    message: string,
    /** Set when the media reached storage before the failure, so a retry can skip it. */
    readonly uploadedPath: string | null,
    readonly cancelled = false
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /abort|cancel/i.test(e.message));
}

function friendly(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message && !/^\[object/.test(e.message)) {
    if (/network request failed|offline|internet/i.test(e.message)) {
      return 'No connection. Check your network and try again.';
    }
    return e.message;
  }
  return fallback;
}

/**
 * Streams the file to the private post-images bucket with byte progress.
 *
 * supabase-js buffers the whole file in JS and reports nothing until the
 * response lands, so we hit the Storage REST endpoint directly through the
 * native upload task (URLSession) — a 14 s video never touches JS memory and
 * the progress ring is real.
 */
async function uploadMedia(
  path: string,
  media: PreparedMedia,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Signed out. Sign in again to post.');

  const encoded = path.split('/').map(encodeURIComponent).join('/');
  // Binary uploads ignore `mimeType` (it only labels multipart parts), so the
  // Content-Type must be an explicit header — without it Storage sees
  // application/octet-stream and the bucket's allowed-types list rejects it.
  const result = await new File(media.uri).upload(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encoded}`, {
    httpMethod: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': media.mimeType,
      'x-upsert': 'true',
      // Paths are unique per upload (userId/timestamp), so the object never
      // changes: let the CDN and every device cache it for a year.
      'cache-control': 'max-age=31536000, immutable',
    },
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) onProgress?.(Math.min(1, bytesSent / totalBytes));
    },
    signal,
  });

  if (result.status < 200 || result.status >= 300) {
    let message = `Upload failed (${result.status}).`;
    try {
      const body = JSON.parse(result.body) as { message?: string; error?: string };
      if (body.message) message = body.message;
      else if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  onProgress?.(1);
}

/**
 * Upload (if needed) → insert → feed refresh. Throws PublishError carrying
 * the uploaded path so the caller can retry without re-sending the file.
 */
export async function publishPost(input: PublishInput): Promise<PublishResult> {
  const { userId, media, onPhase, onProgress, signal } = input;
  let uploadedPath = input.uploadedPath ?? null;
  let prepared: PreparedMedia | null = null;

  if (media) {
    // Resize + hash even on a retry that skips the upload: the row needs the
    // pixel size and ThumbHash, and the prep is a few hundred ms.
    onPhase?.('preparing');
    prepared = await prepareForUpload(media);
    if (signal?.aborted) throw new PublishError('Upload cancelled.', uploadedPath, true);
  }

  if (prepared && !uploadedPath) {
    onPhase?.('uploading');
    const path = `${userId}/${Date.now()}.${prepared.fileExt}`;
    try {
      await uploadMedia(path, prepared, onProgress, signal);
    } catch (e) {
      if (isAbort(e) || signal?.aborted) throw new PublishError('Upload cancelled.', null, true);
      throw new PublishError(friendly(e, "Couldn't upload your media."), null);
    }
    uploadedPath = path;
  } else if (prepared) {
    onProgress?.(1);
  }

  if (signal?.aborted) throw new PublishError('Upload cancelled.', uploadedPath, true);

  onPhase?.('publishing');
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      text: input.text,
      image_url: media ? uploadedPath : null,
      media_type: media?.type ?? null,
      media_width: prepared?.width ?? null,
      media_height: prepared?.height ?? null,
      media_hash: prepared?.thumbhash ?? null,
      venue_name: input.venueName,
      venue_id: input.venueId,
      expires_at: getPostExpiry(getActiveCity()),
      visibility: input.visibility,
    })
    .select('id, created_at')
    .single();
  if (error || !data) {
    throw new PublishError(
      friendly(error ? new Error(error.message) : null, "Couldn't share your post."),
      uploadedPath
    );
  }

  invalidateFeed();
  return {
    uploadedPath,
    post: {
      id: data.id,
      created_at: data.created_at ?? new Date().toISOString(),
      text: input.text,
      venue_name: input.venueName,
      venue_id: input.venueId,
      visibility: input.visibility,
      media,
    },
  };
}
