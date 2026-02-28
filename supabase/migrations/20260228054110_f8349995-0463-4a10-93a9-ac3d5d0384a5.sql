
-- Step 1: Drop the overly broad SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read basic profile info" ON public.profiles;

-- Step 2: Revoke all grants
REVOKE ALL ON public.profiles FROM authenticated;
REVOKE ALL ON public.profiles FROM anon;

-- Step 3: Re-apply precise column-level grants
GRANT SELECT (id, display_name, username, avatar_url, bio, home_city, created_at, has_onboarded, is_demo, location_sharing_level, push_enabled) ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT (id, display_name, username, avatar_url) ON public.profiles TO anon;
