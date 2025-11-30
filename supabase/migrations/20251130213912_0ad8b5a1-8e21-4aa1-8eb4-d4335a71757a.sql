-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true);

-- RLS policy: Users can upload their own avatars
CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS policy: Users can update their own avatars
CREATE POLICY "Users can update avatars"
ON storage.objects FOR UPDATE
TO public
USING (
  bucket_id = 'avatars' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS policy: Users can delete their own avatars
CREATE POLICY "Users can delete avatars"
ON storage.objects FOR DELETE
TO public
USING (
  bucket_id = 'avatars' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS policy: Public read access for avatars
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Add has_onboarded column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_onboarded boolean DEFAULT false;