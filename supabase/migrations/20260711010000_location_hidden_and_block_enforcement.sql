-- Per-person "Hide My Location" table
-- user_id hides their location FROM hidden_from_id (one-directional)
CREATE TABLE IF NOT EXISTS public.location_hidden (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  hidden_from_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, hidden_from_id)
);

ALTER TABLE public.location_hidden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can hide from others"
ON public.location_hidden FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own hides"
ON public.location_hidden FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can unhide"
ON public.location_hidden FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_location_hidden_lookup
ON public.location_hidden(user_id, hidden_from_id);

-- Update can_see_location to enforce hide + block server-side
-- viewer_id wants to see target_user_id's location
CREATE OR REPLACE FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- Always see yourself
    WHEN viewer_id = target_user_id THEN true
    -- Block check: if either party blocked the other, deny
    WHEN EXISTS (
      SELECT 1 FROM blocked_users
      WHERE (blocker_id = target_user_id AND blocked_id = viewer_id)
         OR (blocker_id = viewer_id AND blocked_id = target_user_id)
    ) THEN false
    -- Hide check: target has hidden their location from viewer
    WHEN EXISTS (
      SELECT 1 FROM location_hidden
      WHERE user_id = target_user_id AND hidden_from_id = viewer_id
    ) THEN false
    -- Normal privacy ring checks
    WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'close_friends' THEN
      public.is_close_friend(viewer_id, target_user_id)
    WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'all_friends' THEN
      public.is_direct_friend(viewer_id, target_user_id)
    WHEN (SELECT location_sharing_level FROM profiles WHERE id = target_user_id) = 'mutual_friends' THEN
      public.is_friend_or_mutual(viewer_id, target_user_id)
    ELSE false
  END
$$;

-- Block should also cancel any pending friend requests in either direction
CREATE OR REPLACE FUNCTION public.on_block_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete pending friend requests between blocker and blocked
  DELETE FROM friendships
  WHERE status = 'pending'
    AND (
      (user_id = NEW.blocker_id AND friend_id = NEW.blocked_id)
      OR (user_id = NEW.blocked_id AND friend_id = NEW.blocker_id)
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_cleanup_trigger ON public.blocked_users;
CREATE TRIGGER block_cleanup_trigger
  AFTER INSERT ON public.blocked_users
  FOR EACH ROW
  EXECUTE FUNCTION public.on_block_cleanup();
