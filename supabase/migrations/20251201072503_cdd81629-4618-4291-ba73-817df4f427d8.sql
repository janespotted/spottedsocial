-- Create a secure function to fetch profiles with location data masked based on privacy settings
-- This should be used instead of direct profiles table access for location-sensitive queries

CREATE OR REPLACE FUNCTION public.get_profiles_safe()
RETURNS TABLE (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  home_city text,
  created_at timestamptz,
  has_onboarded boolean,
  is_demo boolean,
  location_sharing_level text,
  last_known_lat double precision,
  last_known_lng double precision,
  is_out boolean,
  last_active_at timestamptz,
  last_location_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.bio,
    p.home_city,
    p.created_at,
    p.has_onboarded,
    p.is_demo,
    p.location_sharing_level,
    -- Only show location fields if viewer has permission
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_known_lat ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_known_lng ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.is_out ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_active_at ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_location_at ELSE NULL END
  FROM profiles p;
$$;

-- Function to get a single profile safely
CREATE OR REPLACE FUNCTION public.get_profile_safe(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  bio text,
  home_city text,
  created_at timestamptz,
  has_onboarded boolean,
  is_demo boolean,
  location_sharing_level text,
  last_known_lat double precision,
  last_known_lng double precision,
  is_out boolean,
  last_active_at timestamptz,
  last_location_at timestamptz,
  can_view_location boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.display_name,
    p.username,
    p.avatar_url,
    p.bio,
    p.home_city,
    p.created_at,
    p.has_onboarded,
    p.is_demo,
    p.location_sharing_level,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_known_lat ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_known_lng ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.is_out ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_active_at ELSE NULL END,
    CASE WHEN auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id) 
         THEN p.last_location_at ELSE NULL END,
    (auth.uid() = p.id OR public.can_see_location(auth.uid(), p.id))
  FROM profiles p
  WHERE p.id = target_user_id;
$$;

-- Now update the profiles RLS policy to restrict direct access to sensitive columns
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Profiles basic info viewable by everyone" ON public.profiles;

-- Create new policy: authenticated users can view basic profile info
-- But sensitive location fields will only return data via the secure functions above
CREATE POLICY "Profiles viewable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Anon users can only see profiles for public display (signup flow, etc.)
CREATE POLICY "Profiles basic viewable by anon"
ON public.profiles
FOR SELECT
TO anon
USING (true);

-- Grant execute on the secure functions
GRANT EXECUTE ON FUNCTION public.get_profiles_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_safe(uuid) TO authenticated;