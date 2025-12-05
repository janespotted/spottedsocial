-- Fix critical security issue: User location data exposed to all authenticated users
-- Change the policy to only allow viewing profiles if:
-- 1. The user is viewing their own profile, OR
-- 2. The user has location permission via privacy rings (can_see_location function)

-- First drop the existing overly permissive policy
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;

-- Create a new restrictive policy that respects privacy settings
-- This policy allows basic profile info to be visible, but the can_see_location
-- function (which is already used by get_profiles_safe) will control location field access
CREATE POLICY "Profiles viewable by authenticated users" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (
  auth.uid() = id OR 
  can_see_location(auth.uid(), id)
);

-- Also ensure the anonymous policy doesn't exist (cleanup)
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;