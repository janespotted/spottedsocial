-- Add location sharing fields to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_out boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_known_lat double precision,
ADD COLUMN IF NOT EXISTS last_known_lng double precision,
ADD COLUMN IF NOT EXISTS last_location_at timestamp with time zone;

-- Add index for faster location queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_out ON public.profiles(is_out) WHERE is_out = true;