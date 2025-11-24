-- Drop the foreign key constraint on profiles.id
-- This allows demo profiles to exist without corresponding auth users
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Add a comment explaining why this was done
COMMENT ON TABLE public.profiles IS 'Profile table supports both real users (with auth.users entries) and demo users (marked with is_demo=true)';
