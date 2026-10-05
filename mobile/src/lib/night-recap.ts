import { supabase } from './supabase';
import { resolvePrivateMedia } from './private-media';
import { prepareForUpload } from './media-prep';
import { pickPhotoFromLibrary } from './post-media';
import { uploadMedia } from './publish-post';

/**
 * Morning After (DAY-NIGHT-MODE-PLAN.md §2). The 5 AM reset builds a private
 * recap of the night BEFORE it deletes anything — the user's verified stops,
 * their own photos and the friends whose shared check-ins overlapped — and
 * `get_night_recap()` hands the caller theirs (owner only). Nothing here is
 * computed on the device and nothing here is ever fabricated: no recap row
 * means the night had no activity, and the app says so.
 */
export interface RecapStop {
  venue_id: string | null;
  venue_name: string;
  neighborhood: string | null;
  arrived_at: string;
  /** Only when the departure was really recorded; null hides "Until". */
  left_at: string | null;
}

export interface RecapPhoto {
  id: string;
  storage_key: string;
  width: number | null;
  height: number | null;
  thumbhash: string | null;
  source: 'post' | 'library';
}

export interface RecapPerson {
  friend_id: string;
  display_name: string;
  avatar_url: string | null;
  venue_id: string | null;
  venue_name: string;
}

export interface NightRecap {
  id: string;
  /** YYYY-MM-DD of the night (its 5 AM start), shown as "SEP 21". */
  night_date: string;
  expires_at: string;
  stops: RecapStop[];
  photos: RecapPhoto[];
  people: RecapPerson[];
}

export const NIGHT_RECAP_KEY = 'night-recap';
/** At most this many photos per night, matching add_recap_photo on the server. */
export const MAX_RECAP_PHOTOS = 9;

/** The caller's latest unexpired recap, or null (no activity, or none built yet). */
export async function fetchNightRecap(): Promise<NightRecap | null> {
  const { data, error } = await supabase.rpc('get_night_recap');
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  const r = data as Partial<NightRecap>;
  if (!r.id || !r.night_date) return null;
  return {
    id: r.id,
    night_date: r.night_date,
    expires_at: r.expires_at ?? '',
    stops: r.stops ?? [],
    photos: r.photos ?? [],
    people: r.people ?? [],
  };
}

/** Signed links for the recap's photos (owner only, via private_media_target). */
export async function resolveRecapPhotoUrls(photos: RecapPhoto[]): Promise<Map<string, string>> {
  if (photos.length === 0) return new Map();
  const { paths } = await resolvePrivateMedia({ paths: photos.map((p) => p.storage_key) });
  return paths;
}

/** "SEP 21" from the night's date (a calendar date, so read in UTC). */
export function recapDateLabel(nightDate: string): string {
  return new Date(`${nightDate}T12:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .toUpperCase();
}

export type RecapChapter = 'stops' | 'pictures' | 'people';

/**
 * The replay's chapters, as in the mockup: always The stops, The pictures,
 * The people once there is a recap (an empty one shows its placeholder),
 * none when the night had nothing at all.
 */
export function recapChapters(recap: Pick<NightRecap, 'stops' | 'photos' | 'people'>): RecapChapter[] {
  const any = recap.stops.length > 0 || recap.photos.length > 0 || recap.people.length > 0;
  return any ? ['stops', 'pictures', 'people'] : [];
}

/**
 * "Add from your library": only a photo the user explicitly picks in the
 * system picker (no library access otherwise), resized like a post photo,
 * uploaded under <uid>/recap-v1/ and attached to their recap. False when
 * the picker was cancelled.
 */
export async function addLibraryPhoto(recapId: string, userId: string): Promise<boolean> {
  const picked = await pickPhotoFromLibrary();
  if (!picked) return false;
  const prepared = await prepareForUpload(picked);
  const path = `${userId}/recap-v1/${Date.now()}.${prepared.fileExt}`;
  await uploadMedia(path, prepared);
  const { error } = await supabase.rpc('add_recap_photo', {
    p_recap: recapId,
    p_key: path,
    p_width: prepared.width,
    p_height: prepared.height,
    p_thumbhash: prepared.thumbhash,
  });
  if (error) throw error;
  return true;
}

/** Testers only: a recap of tonight so far, instead of waiting for 5 AM. */
export async function buildMyRecapNow(): Promise<void> {
  const { error } = await supabase.rpc('build_my_recap_now');
  if (error) throw error;
}
