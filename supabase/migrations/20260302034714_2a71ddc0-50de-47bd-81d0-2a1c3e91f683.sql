
-- Make yap-media bucket private (was public, exposing media to unauthenticated users)
UPDATE storage.buckets SET public = false WHERE id = 'yap-media';

-- Drop the old public SELECT policy
DROP POLICY IF EXISTS "Yap media is publicly accessible" ON storage.objects;

-- Create new policy: only authenticated users can view yap media
CREATE POLICY "Authenticated users can view yap media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'yap-media');
