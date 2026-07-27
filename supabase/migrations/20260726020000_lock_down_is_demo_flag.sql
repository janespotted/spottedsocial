-- WP5: Prevent authenticated users from self-flagging rows as is_demo=true.
-- Only service_role (used by edge functions) can set is_demo=true,
-- OR the row's owner profile must already be is_demo=true (demo-on-demo writes).

-- ── Helper: SECURITY DEFINER so it bypasses profiles RLS ──
CREATE OR REPLACE FUNCTION public.is_demo_user(_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_demo FROM profiles WHERE id = _uid),
    false
  )
$$;

-- ── Trigger function: block is_demo=true from non-service-role callers ──
-- Called only when NEW.is_demo = true (WHEN clause on each trigger).
CREATE OR REPLACE FUNCTION public.guard_is_demo_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id UUID;
BEGIN
  -- Allow service_role (edge functions / admin) unconditionally
  IF current_setting('request.jwt.role', true) = 'service_role' THEN
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

-- ── Apply trigger to profiles ──
DROP TRIGGER IF EXISTS guard_is_demo_profiles ON public.profiles;
CREATE TRIGGER guard_is_demo_profiles
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.is_demo = true)
  EXECUTE FUNCTION public.guard_is_demo_flag();

-- ── Apply trigger to night_statuses ──
DROP TRIGGER IF EXISTS guard_is_demo_night_statuses ON public.night_statuses;
CREATE TRIGGER guard_is_demo_night_statuses
  BEFORE INSERT OR UPDATE ON public.night_statuses
  FOR EACH ROW
  WHEN (NEW.is_demo = true)
  EXECUTE FUNCTION public.guard_is_demo_flag();

-- ── Apply trigger to checkins ──
DROP TRIGGER IF EXISTS guard_is_demo_checkins ON public.checkins;
CREATE TRIGGER guard_is_demo_checkins
  BEFORE INSERT OR UPDATE ON public.checkins
  FOR EACH ROW
  WHEN (NEW.is_demo = true)
  EXECUTE FUNCTION public.guard_is_demo_flag();

-- ── Re-point demo SELECT policies to owner's profile flag ──
-- Use is_demo_user() which is SECURITY DEFINER, so profiles RLS doesn't block it.

DROP POLICY IF EXISTS "Demo statuses are visible to authenticated users" ON public.night_statuses;
CREATE POLICY "Demo statuses are visible to authenticated users"
  ON public.night_statuses FOR SELECT
  TO authenticated
  USING (is_demo_user(user_id));

DROP POLICY IF EXISTS "Demo checkins are visible to authenticated users" ON public.checkins;
CREATE POLICY "Demo checkins are visible to authenticated users"
  ON public.checkins FOR SELECT
  TO authenticated
  USING (is_demo_user(user_id));

-- profiles already has "Demo profiles are readable by authenticated users" USING (is_demo = true)
-- For profiles, the row flag IS the owner flag, so the existing policy is fine.
-- But let's still re-point it through is_demo_user for consistency.
DROP POLICY IF EXISTS "Demo profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Demo profiles are readable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_demo_user(id));
