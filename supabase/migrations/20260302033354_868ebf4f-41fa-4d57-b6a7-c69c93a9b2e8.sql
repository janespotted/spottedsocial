
-- Revoke push_enabled from authenticated users (only the profile owner needs this)
REVOKE SELECT (push_enabled) ON public.profiles FROM authenticated;
