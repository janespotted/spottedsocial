import { supabase } from '@/integrations/supabase/client';

/**
 * Resolve a post image URL. If it's a storage path (not http), generate a signed URL.
 * Legacy posts may have full public URLs that no longer work after bucket was made private.
 */
export async function resolvePostImageUrl(imageUrl: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  
  // If it's already a signed URL or external URL, return as-is
  // But if it's a public URL from our storage, we need to generate a signed URL
  if (imageUrl.includes('/storage/v1/object/public/post-images/')) {
    // Extract the file path from the old public URL
    const path = imageUrl.split('/storage/v1/object/public/post-images/')[1];
    if (path) {
      const { data } = await supabase.storage
        .from('post-images')
        .createSignedUrl(path, 3600); // 1 hour
      return data?.signedUrl || null;
    }
  }
  
  // If it's a relative path (no http), generate signed URL
  if (!imageUrl.startsWith('http')) {
    const { data } = await supabase.storage
      .from('post-images')
      .createSignedUrl(imageUrl, 3600);
    return data?.signedUrl || null;
  }
  
  return imageUrl;
}

/**
 * Resolve image URLs for an array of posts
 */
export async function resolvePostImageUrls<
  T extends { image_url?: string | null; media_type?: string | null; mux_playback_id?: string | null },
>(posts: T[]): Promise<T[]> {
  return Promise.all(
    posts.map(async (post) => {
      // Mobile video posts live on Mux (no storage object): hand the <video>
      // the HLS manifest, which WKWebView and Safari play natively.
      if (!post.image_url && post.media_type === 'video' && post.mux_playback_id) {
        return { ...post, image_url: `https://stream.mux.com/${post.mux_playback_id}.m3u8` };
      }
      if (!post.image_url) return post;
      const resolvedUrl = await resolvePostImageUrl(post.image_url);
      return { ...post, image_url: resolvedUrl };
    })
  );
}
