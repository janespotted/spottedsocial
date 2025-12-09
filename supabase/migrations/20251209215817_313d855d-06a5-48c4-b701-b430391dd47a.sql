-- Remove the overly permissive policy that allows anyone to view dm-images
-- This ensures only thread members can view DM images via the existing restrictive policy
DROP POLICY IF EXISTS "Anyone can view dm images" ON storage.objects;