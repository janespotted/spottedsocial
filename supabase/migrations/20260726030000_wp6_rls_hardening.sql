-- WP6: Server-side privacy migrations (P0-6, P1-7, P1-8, P2-6, P2-7)

-- ═════════════════════════════════════════════════════════════════════
-- 1. Protect party_address (P0-6)
--    Revoke column-level SELECT so authenticated users cannot read it.
--    No src/ call site reads party_address — all mentions are writes.
--    Supersedes default table-level SELECT grant.
-- ═════════════════════════════════════════════════════════════════════

REVOKE SELECT ON public.night_statuses FROM authenticated;
GRANT SELECT (
  id, user_id, status, venue_id, venue_name,
  lat, lng, expires_at, updated_at,
  is_demo, is_private_party, is_promoted,
  party_neighborhood, planning_neighborhood, planning_visibility
) ON public.night_statuses TO authenticated;
-- party_address intentionally excluded

-- RPC: return party_address only to owner or invited friend
CREATE OR REPLACE FUNCTION public.get_party_address(p_status_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  addr text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT party_address INTO addr
    FROM night_statuses
    WHERE user_id = p_status_user_id;

  -- Owner always sees their own address
  IF auth.uid() = p_status_user_id THEN
    RETURN addr;
  END IF;

  -- Invited friends: have a private_party_invite notification from the owner
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE type = 'private_party_invite'
      AND sender_id = p_status_user_id
      AND receiver_id = auth.uid()
  ) THEN
    RETURN addr;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_party_address(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_party_address(uuid) FROM anon;

-- ═════════════════════════════════════════════════════════════════════
-- 2. Planning RLS: enforce blocks/hide + mutual_friends arm (P1-8)
--    Supersedes 20260708223000 night_statuses policy.
--    The planning branch previously skipped block/hide checks and had
--    no mutual_friends CASE arm.
-- ═════════════════════════════════════════════════════════════════════

-- Helper: mirrors can_see_location structure for planning visibility.
CREATE OR REPLACE FUNCTION public.can_see_planning(
  viewer_id uuid, target_user_id uuid, visibility text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Auth-binding guard (WP1 pattern)
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  -- Self always visible
  IF viewer_id = target_user_id THEN
    RETURN true;
  END IF;

  -- Block check
  IF EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = target_user_id AND blocked_id = viewer_id)
       OR (blocker_id = viewer_id AND blocked_id = target_user_id)
  ) THEN
    RETURN false;
  END IF;

  -- Hide check
  IF EXISTS (
    SELECT 1 FROM location_hidden
    WHERE user_id = target_user_id AND hidden_from_id = viewer_id
  ) THEN
    RETURN false;
  END IF;

  -- Visibility ladder
  CASE COALESCE(visibility, 'all_friends')
    WHEN 'close_friends' THEN
      RETURN public.is_close_friend(viewer_id, target_user_id);
    WHEN 'all_friends' THEN
      RETURN public.is_direct_friend(viewer_id, target_user_id);
    WHEN 'mutual_friends' THEN
      RETURN public.is_friend_or_mutual(viewer_id, target_user_id);
    ELSE
      RETURN public.is_direct_friend(viewer_id, target_user_id);
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.can_see_planning(uuid, uuid, text) FROM anon;

-- Replace the night_statuses SELECT policy (supersedes 20260708223000)
DROP POLICY IF EXISTS "Night statuses viewable by friends" ON public.night_statuses;
CREATE POLICY "Night statuses viewable by friends" ON public.night_statuses
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      CASE
        WHEN status = 'planning' THEN
          public.can_see_planning(auth.uid(), user_id, planning_visibility)
        ELSE
          public.can_see_location(auth.uid(), user_id)
      END
    )
  );

-- ═════════════════════════════════════════════════════════════════════
-- 3. Bound the checkin history (P1-7)
--    - DELETE policy: users can delete own checkins
--    - SELECT policy: non-self reads limited to 30 days
--    - Schedule cleanup_old_checkins (defined in 20251209044337, never scheduled)
--    - Schedule location_events 90-day purge (promised in 20260428010000)
--    Supersedes 20260708223000 checkins policy.
-- ═════════════════════════════════════════════════════════════════════

-- DELETE policy
DROP POLICY IF EXISTS "Users can delete own checkins" ON public.checkins;
CREATE POLICY "Users can delete own checkins" ON public.checkins
  FOR DELETE USING (auth.uid() = user_id);

-- SELECT policy with 30-day cap for non-self reads
DROP POLICY IF EXISTS "Checkins viewable by friends" ON public.checkins;
CREATE POLICY "Checkins viewable by friends" ON public.checkins
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      public.can_see_location(auth.uid(), user_id)
      AND started_at > now() - interval '30 days'
    )
  );

-- Schedule cleanup_old_checkins daily at 10:30 UTC (defined in 20251209044337)
-- Schedule location_events 90-day purge daily at 6:15 UTC (promised in 20260428010000)
-- Only if pg_cron is available (not all plans/projects have it enabled)
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule(
      'cleanup-old-checkins',
      '30 10 * * *',
      'SELECT public.cleanup_old_checkins()'
    );
    PERFORM cron.schedule(
      'cleanup-location-events-90d',
      '15 6 * * *',
      $$DELETE FROM public.location_events WHERE created_at < now() - interval '90 days'$$
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — skipping cron job scheduling';
  END IF;
END $outer$;

-- ═════════════════════════════════════════════════════════════════════
-- 4. Small hardening (P2-6, P2-7)
-- ═════════════════════════════════════════════════════════════════════

-- 4a. venue_notif_throttle INSERT policy: only insert for self
DROP POLICY IF EXISTS "Authenticated users can insert throttle records" ON public.venue_notif_throttle;
CREATE POLICY "Authenticated users can insert throttle records"
  ON public.venue_notif_throttle FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4b. location_hidden: add FKs with ON DELETE CASCADE
--     (table exists from 20260711010000 but had no FKs)
ALTER TABLE public.location_hidden
  ADD CONSTRAINT location_hidden_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.location_hidden
  ADD CONSTRAINT location_hidden_hidden_from_id_fkey
    FOREIGN KEY (hidden_from_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4c. Fix clear_stale_push_token: remove reference to nonexistent push_token column.
--     types.ts shows only apns_device_token; the RPC set push_token = NULL which
--     would error if the column doesn't exist. Fix to only clear apns_device_token.
CREATE OR REPLACE FUNCTION public.clear_stale_push_token(
  p_token text,
  p_keep_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE profiles
  SET apns_device_token = NULL
  WHERE apns_device_token = p_token
    AND id <> p_keep_user_id;
END;
$$;
