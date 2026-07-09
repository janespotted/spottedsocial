-- Align "out" status visibility with location_sharing_level on profiles.
-- Previously, "out" statuses were visible to all direct friends regardless of
-- the user's location_sharing_level. Now they follow the same rules as the map:
--   all_friends    -> direct friends can see
--   close_friends  -> only close friends can see
--   mutual_friends -> direct friends AND friends-of-friends can see

DROP POLICY IF EXISTS "Night statuses viewable by friends" ON public.night_statuses;
CREATE POLICY "Night statuses viewable by friends" ON public.night_statuses
  FOR SELECT USING (
    auth.uid() = user_id
    OR (
      CASE
        -- Planning statuses: respect planning_visibility
        WHEN status = 'planning' THEN
          CASE COALESCE(planning_visibility, 'all_friends')
            WHEN 'close_friends' THEN public.is_close_friend(auth.uid(), user_id)
            WHEN 'all_friends' THEN public.is_direct_friend(auth.uid(), user_id)
            ELSE public.is_direct_friend(auth.uid(), user_id)
          END
        -- Out/other statuses: respect location_sharing_level from profiles
        ELSE public.can_see_location(auth.uid(), user_id)
      END
    )
  );

-- Align checkins visibility with location_sharing_level
DROP POLICY IF EXISTS "Checkins viewable by friends" ON public.checkins;
CREATE POLICY "Checkins viewable by friends" ON public.checkins
  FOR SELECT USING (
    auth.uid() = user_id
    OR public.can_see_location(auth.uid(), user_id)
  );
