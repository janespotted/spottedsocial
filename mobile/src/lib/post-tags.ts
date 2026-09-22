import { supabase } from './supabase';
import { fetchProfilesSafe } from './profiles';

/**
 * Tagging friends in a post (addendum v3 §9.3). A tag is a pointer, never
 * a grant: `post_tags` RLS mirrors the post's own visibility, so tagging
 * someone outside the audience shows them nothing. Tags cascade with the
 * post, so the 5 AM reset takes them too.
 */

export interface TaggedFriend {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

/** Write the tag rows for a freshly published post. Best effort. */
export async function savePostTags(postId: string, friendIds: string[]): Promise<void> {
  if (friendIds.length === 0) return;
  const { error } = await supabase
    .from('post_tags')
    .insert(friendIds.map((id) => ({ post_id: postId, tagged_user_id: id })));
  if (error) throw error;
}

/** Who is tagged in these posts, for the feed. */
export async function fetchTagsForPosts(postIds: string[]): Promise<Map<string, TaggedFriend[]>> {
  const byPost = new Map<string, TaggedFriend[]>();
  if (postIds.length === 0) return byPost;
  const { data: rows } = await supabase
    .from('post_tags')
    .select('post_id, tagged_user_id')
    .in('post_id', postIds);
  if (!rows?.length) return byPost;

  const profiles = await fetchProfilesSafe();
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const row of rows) {
    const profile = byId.get(row.tagged_user_id);
    if (!profile) continue; // blocked / not visible to this viewer
    const list = byPost.get(row.post_id) ?? [];
    list.push({
      id: profile.id,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
    });
    byPost.set(row.post_id, list);
  }
  return byPost;
}

/** Names as a sentence for the post card: "with Ava, Ben and 2 others". */
export function tagLine(tags: TaggedFriend[]): string {
  const names = tags.map((t) => t.display_name.split(' ')[0]);
  if (names.length === 1) return `with ${names[0]}`;
  if (names.length === 2) return `with ${names[0]} and ${names[1]}`;
  return `with ${names[0]}, ${names[1]} and ${names.length - 2} ${
    names.length - 2 === 1 ? 'other' : 'others'
  }`;
}
