
-- Add media columns to yap_messages
ALTER TABLE public.yap_messages
ADD COLUMN image_url text,
ADD COLUMN media_type text;

-- Create storage bucket for yap media
INSERT INTO storage.buckets (id, name, public)
VALUES ('yap-media', 'yap-media', true);

-- Allow authenticated users to upload to yap-media
CREATE POLICY "Authenticated users can upload yap media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'yap-media' AND auth.uid() IS NOT NULL);

-- Allow public read access to yap media
CREATE POLICY "Yap media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'yap-media');

-- Allow users to delete their own yap media
CREATE POLICY "Users can delete own yap media"
ON storage.objects FOR DELETE
USING (bucket_id = 'yap-media' AND auth.uid()::text = (storage.foldername(name))[1]);
