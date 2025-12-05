-- Fix Warning #1: Make dm-images bucket private and add proper access policy
-- This prevents anyone from accessing DM images unless they're a thread member

-- Make the bucket private
UPDATE storage.buckets SET public = false WHERE id = 'dm-images';

-- Add policy for thread members to view DM images
-- Images are stored with thread_id as folder name: {thread_id}/{filename}
CREATE POLICY "Thread members can view dm images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'dm-images' AND
  EXISTS (
    SELECT 1 FROM public.dm_thread_members
    WHERE user_id = auth.uid()
    AND thread_id::text = (storage.foldername(name))[1]
  )
);

-- Add policy for thread members to upload DM images
CREATE POLICY "Thread members can upload dm images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dm-images' AND
  EXISTS (
    SELECT 1 FROM public.dm_thread_members
    WHERE user_id = auth.uid()
    AND thread_id::text = (storage.foldername(name))[1]
  )
);

-- Fix Warning #2: Tighten invite_uses INSERT policy
-- Only the newly signed-up user can create their own invite use record
DROP POLICY IF EXISTS "Anyone can insert invite uses on signup" ON public.invite_uses;

CREATE POLICY "Authenticated users can insert own invite use"
ON public.invite_uses
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND
  auth.uid() = invited_user_id
);