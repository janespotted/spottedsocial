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
export async function resolvePostImageUrls<T extends { image_url?: string | null }>(
  posts: T[]
): Promise<T[]> {
  return Promise.all(
    posts.map(async (post) => {
      if (!post.image_url) return post;
      const resolvedUrl = await resolvePostImageUrl(post.image_url);
      return { ...post, image_url: resolvedUrl };
    })
  );
}
