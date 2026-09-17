import { supabase } from './supabase';
import { DEMO_MODE } from './demo-mode';
import { getStatusExpiry } from './night-status';
import { resolvePostImageUrl } from './posts';
import { isFromTonight } from './time-context';

/**
 * Yap — anonymous venue chat. Port of the web YapTab/VenueYapThread data
 * layer. Yaps are anonymous (random per-post handle), expire at 5am, and
 * posting is gated on being checked in at the venue (canPost is the
 * caller's responsibility).
 */

export const YAP_COOLDOWN_MS = 30_000;

export interface YapQuote {
  id: string;
  text: string;
  score: number;
  venue_name: string;
  venue_neighborhood: string | null;
  created_at: string;
  pinned_count: number;
}

export interface YapMessage {
  id: string;
  text: string;
  created_at: string;
  author_handle: string | null;
  image_url: string | null;
  user_id: string;
  score: number;
  comments_count: number;
  user_vote: 'up' | 'down' | null;
}

export interface YapComment {
  id: string;
  text: string;
  created_at: string;
  author_handle: string | null;
  user_id: string;
  score: number;
}

export interface PinnedVenueMessage {
  id: string;
  text: string;
  created_at: string;
}

const randomHandle = () => `User${Math.floor(100000 + Math.random() * 900000)}`;

/** Directory: tonight's yaps across the city's venues, with pinned counts. */
export async function fetchYapDirectory(city: string): Promise<YapQuote[]> {
  let query = supabase
    .from('yap_messages')
    .select('id, text, score, venue_name, created_at')
    .gt('expires_at', new Date().toISOString())
    .eq('is_private_party', false);
  if (!DEMO_MODE) query = query.eq('is_demo', false);
  const { data: yaps } = await query;
  const regular = (yaps ?? []).filter((y) => isFromTonight(y.created_at));
  if (regular.length === 0) return [];

  // Venue metadata — also filters the directory to the current city
  const venueNames = [...new Set(regular.map((y) => y.venue_name))];
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, neighborhood')
    .in('name', venueNames)
    .eq('city', city);
  const venueMeta = new Map(
    (venues ?? []).map((v) => [v.name, { id: v.id, neighborhood: v.neighborhood }])
  );

  // Pinned business-message counts (last 24h) per venue
  const pinnedByName = new Map<string, number>();
  const venueIds = [...venueMeta.values()].map((v) => v.id);
  if (venueIds.length > 0) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: pinned } = await supabase
      .from('venue_yap_messages')
      .select('venue_id')
      .eq('is_pinned', true)
      .in('venue_id', venueIds)
      .gte('created_at', dayAgo);
    const countsById = new Map<string, number>();
    for (const row of pinned ?? []) {
      countsById.set(row.venue_id, (countsById.get(row.venue_id) ?? 0) + 1);
    }
    for (const [name, meta] of venueMeta) {
      const count = countsById.get(meta.id);
      if (count) pinnedByName.set(name, count);
    }
  }

  return regular
    .filter((y) => venueMeta.has(y.venue_name))
    .map((y) => ({
      id: y.id,
      text: y.text,
      score: y.score ?? 0,
      venue_name: y.venue_name,
      venue_neighborhood: venueMeta.get(y.venue_name)?.neighborhood ?? null,
      created_at: y.created_at ?? new Date().toISOString(),
      pinned_count: pinnedByName.get(y.venue_name) ?? 0,
    }));
}

/** Thread: a venue's yaps (score-sorted) with the viewer's votes, blocked filtered. */
export async function fetchVenueYaps(venueName: string, userId: string): Promise<YapMessage[]> {
  let query = supabase
    .from('yap_messages')
    .select('id, text, created_at, author_handle, image_url, user_id, score, comments_count')
    .eq('venue_name', venueName)
    .gt('expires_at', new Date().toISOString());
  if (!DEMO_MODE) query = query.eq('is_demo', false);
  const [{ data: yaps }, { data: blocked }] = await Promise.all([
    query,
    supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
  ]);
  const blockedIds = new Set((blocked ?? []).map((b) => b.blocked_id));
  const visible = (yaps ?? []).filter((y) => !blockedIds.has(y.user_id));

  const { data: votes } = visible.length
    ? await supabase
        .from('yap_votes')
        .select('yap_id, vote_type')
        .eq('user_id', userId)
        .in(
          'yap_id',
          visible.map((y) => y.id)
        )
    : { data: [] };
  const voteByYap = new Map((votes ?? []).map((v) => [v.yap_id, v.vote_type as 'up' | 'down']));

  const result = await Promise.all(
    visible.map(async (y): Promise<YapMessage> => ({
      id: y.id,
      text: y.text,
      created_at: y.created_at ?? new Date().toISOString(),
      author_handle: y.author_handle,
      // Storage paths (mobile uploads) resolve to signed URLs
      image_url:
        y.image_url && !y.image_url.startsWith('http')
          ? await resolvePostImageUrl(y.image_url)
          : y.image_url,
      user_id: y.user_id,
      score: y.score ?? 0,
      comments_count: y.comments_count ?? 0,
      user_vote: voteByYap.get(y.id) ?? null,
    }))
  );
  return result.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function fetchPinnedVenueMessages(venueName: string): Promise<PinnedVenueMessage[]> {
  const { data: venue } = await supabase
    .from('venues')
    .select('id')
    .eq('name', venueName)
    .maybeSingle();
  if (!venue?.id) return [];
  const { data } = await supabase
    .from('venue_yap_messages')
    .select('id, text, created_at, is_pinned, expires_at')
    .eq('venue_id', venue.id)
    .eq('is_pinned', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false });
  return (data ?? []).map((m) => ({
    id: m.id,
    text: m.text,
    created_at: m.created_at ?? new Date().toISOString(),
  }));
}

/**
 * Vote through the `vote_on_yap` RPC (toggle off / switch / fresh vote,
 * the web's delta math) — one transaction that writes the vote row AND the
 * score, and returns the server's score and the resulting vote state. The
 * old two-request version (vote row, then increment_yap_score with its error
 * dropped) could leave a saved vote with an unchanged count for good
 * (addendum v3 §8.5). Throws on failure so callers can revert.
 */
export async function voteOnYap(
  yapId: string,
  voteType: 'up' | 'down'
): Promise<{ score: number; vote: 'up' | 'down' | null }> {
  const { data, error } = await supabase.rpc('vote_on_yap', {
    p_yap_id: yapId,
    p_vote_type: voteType,
  });
  if (error) throw error;
  const row = data?.[0];
  return {
    score: row?.score ?? 0,
    vote: row?.user_vote === 'up' || row?.user_vote === 'down' ? row.user_vote : null,
  };
}

export interface YapPartyContext {
  id: string; // night_statuses.id — the unique party identifier
  lat: number | null;
  lng: number | null;
}

export async function postYap(
  userId: string,
  venueName: string,
  text: string,
  imagePath?: string | null,
  party?: YapPartyContext | null
): Promise<void> {
  const { error } = await supabase.from('yap_messages').insert({
    user_id: userId,
    text: text.trim() || '📸',
    venue_name: venueName,
    is_anonymous: true,
    author_handle: randomHandle(),
    score: 0,
    comments_count: 0,
    expires_at: getStatusExpiry(),
    image_url: imagePath ?? null,
    media_type: imagePath ? 'image' : null,
    is_private_party: !!party,
    party_id: party?.id ?? null,
    party_lat: party?.lat ?? null,
    party_lng: party?.lng ?? null,
  } as never);
  if (error) throw error;
}

export async function fetchYapComments(yapId: string): Promise<YapComment[]> {
  const { data } = await supabase
    .from('yap_comments')
    .select('id, text, created_at, author_handle, user_id, score')
    .eq('yap_id', yapId)
    .order('created_at', { ascending: true });
  return (data ?? []) as YapComment[];
}

export async function postYapComment(yapId: string, userId: string, text: string): Promise<void> {
  const { error } = await supabase.from('yap_comments').insert({
    yap_id: yapId,
    user_id: userId,
    text: text.trim(),
    is_anonymous: true,
    author_handle: randomHandle(),
  } as never);
  if (error) throw error;
  // comments_count is maintained by a trigger on yap_comments (migration
  // 20260917110000) — no client read-modify-write.
}
