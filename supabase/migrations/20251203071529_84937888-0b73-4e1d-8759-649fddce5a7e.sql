-- Add image_url column to dm_messages for image sharing in DMs
ALTER TABLE public.dm_messages ADD COLUMN IF NOT EXISTS image_url text;

-- Create storage bucket for DM images
INSERT INTO storage.buckets (id, name, public)
VALUES ('dm-images', 'dm-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for dm-images bucket
CREATE POLICY "Authenticated users can upload dm images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'dm-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view dm images"
ON storage.objects FOR SELECT
USING (bucket_id = 'dm-images');