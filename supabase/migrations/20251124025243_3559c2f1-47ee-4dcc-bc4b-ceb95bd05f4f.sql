-- Add location sharing level to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_sharing_level TEXT DEFAULT 'all_friends' CHECK (location_sharing_level IN ('close_friends', 'mutual_friends', 'all_friends'));

-- Create wishlist table for venues
CREATE TABLE IF NOT EXISTS public.wishlist_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  venue_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, venue_name)
);

-- Enable RLS on wishlist_places
ALTER TABLE public.wishlist_places ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own wishlist
CREATE POLICY "Users can view own wishlist"
ON public.wishlist_places
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can add to their own wishlist
CREATE POLICY "Users can add to own wishlist"
ON public.wishlist_places
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete from their own wishlist
CREATE POLICY "Users can delete from own wishlist"
ON public.wishlist_places
FOR DELETE
USING (auth.uid() = user_id);