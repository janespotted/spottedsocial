-- Drop and recreate the view explicitly as SECURITY INVOKER (which is the default, but being explicit)
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public 
WITH (security_invoker = true)
AS
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
  -- can_see_location is SECURITY DEFINER so it can check the necessary tables
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
  -- Never expose push_subscription
  NULL::jsonb AS push_subscription
FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.profiles_public TO authenticated;