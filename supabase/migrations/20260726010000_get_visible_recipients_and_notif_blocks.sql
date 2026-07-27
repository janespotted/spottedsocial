-- WP4: Privacy-aware notification delivery
--
-- 1. Extract can_see_location core logic into _can_see_location_unchecked
--    (no auth guard) so the new RPC can call it with arbitrary viewer/target.
-- 2. Thin wrapper can_see_location retains the auth guard.
-- 3. New RPC get_visible_recipients for client fan-out filtering.
-- 4. Block check in create_notification / create_notifications_batch.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Internal (unchecked) visibility function — no auth guard
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (
    SELECT CASE
      WHEN viewer_id = target_user_id THEN true
      WHEN EXISTS (
        SELECT 1 FROM blocked_users
        WHERE (blocker_id = target_user_id AND blocked_id = viewer_id)
           OR (blocker_id = viewer_id AND blocked_id = target_user_id)
      ) THEN false
      WHEN EXISTS (
        SELECT 1 FROM location_hidden
        WHERE user_id = target_user_id AND hidden_from_id = viewer_id
      ) THEN false
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'close_friends' THEN
        public.is_close_friend(viewer_id, target_user_id)
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'all_friends' THEN
        public.is_direct_friend(viewer_id, target_user_id)
      WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'mutual_friends' THEN
        public.is_friend_or_mutual(viewer_id, target_user_id)
      ELSE false
    END
  );
END;
$$;

-- Internal — not callable by clients
REVOKE ALL ON FUNCTION public._can_see_location_unchecked(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._can_see_location_unchecked(uuid, uuid) FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Public wrapper retains auth guard, delegates to unchecked core
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Auth-binding guard: authenticated users may only query as themselves.
  -- Service-role / definer contexts (auth.uid() IS NULL) are unrestricted.
  IF auth.uid() IS NOT NULL AND viewer_id IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  RETURN public._can_see_location_unchecked(viewer_id, target_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_see_location(uuid, uuid) FROM anon;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. get_visible_recipients: filter candidate IDs to those who can see
--    the caller's (sender's) location.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_visible_recipients(candidate_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sender_id uuid := auth.uid();
BEGIN
  IF sender_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN ARRAY(
    SELECT c.id
    FROM unnest(candidate_ids) AS c(id)
    WHERE public._can_see_location_unchecked(c.id, sender_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_visible_recipients(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_visible_recipients(uuid[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Block check in create_notification — skip if block exists
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_notification(
  p_receiver_id uuid,
  p_type text,
  p_message text
) RETURNS SETOF notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Block check: skip if either side has blocked the other
  IF EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = auth.uid() AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = auth.uid())
  ) THEN
    RETURN;  -- silently skip
  END IF;

  RETURN QUERY
  INSERT INTO notifications (sender_id, receiver_id, type, message)
  VALUES (auth.uid(), p_receiver_id, p_type, p_message)
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Block check in create_notifications_batch
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_notifications_batch(
  p_notifications jsonb
) RETURNS SETOF notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  notif jsonb;
  recv_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  FOR notif IN SELECT * FROM jsonb_array_elements(p_notifications)
  LOOP
    recv_id := (notif->>'receiver_id')::uuid;

    -- Block check: skip this recipient if block exists
    IF EXISTS (
      SELECT 1 FROM blocked_users
      WHERE (blocker_id = auth.uid() AND blocked_id = recv_id)
         OR (blocker_id = recv_id AND blocked_id = auth.uid())
    ) THEN
      CONTINUE;
    END IF;

    RETURN QUERY
    INSERT INTO notifications (sender_id, receiver_id, type, message)
    VALUES (auth.uid(), recv_id, notif->>'type', notif->>'message')
    RETURNING *;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notifications_batch(jsonb) TO authenticated;
