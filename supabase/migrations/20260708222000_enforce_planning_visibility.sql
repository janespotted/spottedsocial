-- Fix: planning_visibility column on night_statuses was never enforced.
-- Update the RLS policy to check planning_visibility for planning statuses.
-- For non-planning statuses (out, home), keep the existing direct-friend check.

DROP POLICY IF EXISTS "Night statuses viewable by friends" ON public.night_statuses;
CREATE POLICY "Night statuses viewable by friends" ON public.night_statuses
  FOR SELECT USING (
    -- Owner always sees own status
    auth.uid() = user_id
    OR (
      CASE
        -- Planning statuses: respect planning_visibility setting
        WHEN status = 'planning' THEN
          CASE COALESCE(planning_visibility, 'all_friends')
            WHEN 'close_friends' THEN public.is_close_friend(auth.uid(), user_id)
            WHEN 'all_friends' THEN public.is_direct_friend(auth.uid(), user_id)
            ELSE public.is_direct_friend(auth.uid(), user_id)
          END
        -- Non-planning statuses: visible to all direct friends
        ELSE public.is_direct_friend(auth.uid(), user_id)
      END
    )
  );
