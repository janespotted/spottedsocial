
DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
CREATE POLICY "Users can update own friendships" ON public.friendships
FOR UPDATE USING (
  (auth.uid() = user_id) OR (auth.uid() = friend_id)
);
