-- Step 1: Drop the overly restrictive SELECT policy
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;

-- Step 2: Create a more permissive policy that allows all authenticated users to view profiles
-- The sensitive field masking is handled by the view and RPC functions
CREATE POLICY "Profiles viewable by authenticated users" 
ON public.profiles
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Step 3: Create a view that automatically masks sensitive location fields
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT 
  id,
  display_name,
  username,
  avatar_url,
  bio,
  home_city,
  created_at,
  has_onboarded,
  is_demo,
  location_sharing_level,
  push_enabled,
  -- Mask sensitive location fields unless viewer has permission
  CASE WHEN auth.uid() = id OR public.can_see_location(auth.uid(), id) 
       THEN last_known_lat ELSE NULL END AS last_known_lat,
  CASE WHEN auth.uid() = id OR public.can_see_location(auth.uid(), id) 
       THEN last_known_lng ELSE NULL END AS last_known_lng,
  CASE WHEN auth.uid() = id OR public.can_see_location(auth.uid(), id) 
       THEN is_out ELSE NULL END AS is_out,
  CASE WHEN auth.uid() = id OR public.can_see_location(auth.uid(), id) 
       THEN last_active_at ELSE NULL END AS last_active_at,
  CASE WHEN auth.uid() = id OR public.can_see_location(auth.uid(), id) 
       THEN last_location_at ELSE NULL END AS last_location_at,
  -- Never expose push_subscription (contains sensitive endpoint data)
  NULL::jsonb AS push_subscription
FROM public.profiles;

-- Step 4: Grant access to the view for authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;