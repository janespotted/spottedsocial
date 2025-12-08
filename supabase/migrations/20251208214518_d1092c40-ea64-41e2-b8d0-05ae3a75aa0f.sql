-- Add push_subscription column to profiles table for storing Web Push subscriptions
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS push_subscription jsonb DEFAULT NULL;

-- Add push_enabled column for user preference
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS push_enabled boolean DEFAULT true;

-- Create index for faster queries on push-enabled users
CREATE INDEX IF NOT EXISTS idx_profiles_push_enabled 
ON public.profiles (push_enabled) 
WHERE push_subscription IS NOT NULL;