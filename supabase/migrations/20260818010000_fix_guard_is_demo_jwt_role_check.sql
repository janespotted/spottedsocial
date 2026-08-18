-- Fix guard_is_demo_flag trigger: use correct PostgREST GUC for JWT role.
--
-- The trigger was checking current_setting('request.jwt.role', true) which
-- is NOT a valid PostgREST GUC — it always returns ''.
-- PostgREST sets individual JWT claims under request.jwt.claim.<name>,
-- so the correct check is request.jwt.claim.role.
-- As a fallback, also check the PostgreSQL session role via current_setting('role').

CREATE OR REPLACE FUNCTION public.guard_is_demo_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id UUID;
  jwt_role TEXT;
BEGIN
  -- Check both PostgREST GUC and PG session role for service_role
  jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );

  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Determine the owner: profiles uses id, other tables use user_id
  IF TG_TABLE_NAME = 'profiles' THEN
    owner_id := NEW.id;
  ELSE
    owner_id := NEW.user_id;
  END IF;

  -- Allow only if the owner profile is already a demo user (demo-on-demo writes)
  IF NOT is_demo_user(owner_id) THEN
    RAISE EXCEPTION 'Cannot set is_demo=true: owner profile is not a demo user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
