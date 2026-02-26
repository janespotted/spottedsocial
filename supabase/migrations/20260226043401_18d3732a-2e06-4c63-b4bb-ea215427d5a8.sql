
-- Restrict column-level SELECT access on profiles to prevent GPS/activity data leaks
-- SECURITY DEFINER functions (get_profiles_safe, get_profile_safe) bypass column grants
-- and continue to provide location data through proper privacy checks

-- Revoke all existing grants
REVOKE ALL ON public.profiles FROM authenticated;
REVOKE ALL ON public.profiles FROM anon;

-- Grant SELECT only on non-sensitive columns (excludes GPS coordinates and activity tracking)
GRANT SELECT (
  id, display_name, username, avatar_url, bio, home_city,
  created_at, has_onboarded, is_demo, location_sharing_level,
  push_enabled, push_subscription, apns_device_token
) ON public.profiles TO authenticated;

-- Maintain full DML grants (RLS policies still control which rows can be modified)
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

-- Anon role: minimal read access for public profile lookups (e.g., invite landing pages)
GRANT SELECT (id, display_name, username, avatar_url) ON public.profiles TO anon;
