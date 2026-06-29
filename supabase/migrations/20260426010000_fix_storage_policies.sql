-- Ensure avatars bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/jpg','image/png','image/heic','image/heif','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/heic','image/heif','image/webp'];

-- Ensure post-images bucket is public with correct mime types
UPDATE storage.buckets SET public = true, allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/heic','image/heif','image/webp','video/mp4','video/quicktime','video/mov'] WHERE id = 'post-images';

-- Ensure yap-media bucket is public with correct mime types
UPDATE storage.buckets SET public = true, allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/heic','image/heif','image/webp','video/mp4','video/quicktime','video/mov'] WHERE id = 'yap-media';

-- Re-create avatars policies (drop first to be idempotent)
DROP POLICY IF EXISTS "Users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Re-create post-images policies
DROP POLICY IF EXISTS "Users can upload post images" ON storage.objects;
DROP POLICY IF EXISTS "Post images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view post images" ON storage.objects;

CREATE POLICY "Users can upload post images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view post images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-images');

-- Re-create yap-media policies
DROP POLICY IF EXISTS "Users can upload yap media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view yap media" ON storage.objects;
DROP POLICY IF EXISTS "Yap media is publicly accessible" ON storage.objects;

CREATE POLICY "Users can upload yap media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'yap-media'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Anyone can view yap media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'yap-media');
