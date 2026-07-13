-- Allow commenting and liking on mutual friends' posts (visibility = 'mutual_friends')
-- Previously, RLS only checked direct friendships, so mutual friend posts were read-only

-- post_comments: UPDATE INSERT policy
DROP POLICY IF EXISTS "Users can create comments on visible posts" ON public.post_comments;
CREATE POLICY "Users can create comments on visible posts"
ON public.post_comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.posts
    WHERE posts.id = post_comments.post_id
    AND (
      posts.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships
        WHERE (
          (friendships.user_id = auth.uid() AND friendships.friend_id = posts.user_id)
          OR (friendships.friend_id = auth.uid() AND friendships.user_id = posts.user_id)
        )
        AND friendships.status = 'accepted'
      )
      OR (
        posts.visibility = 'mutual_friends'
        AND posts.user_id IN (SELECT get_mutual_friend_ids(auth.uid()))
      )
    )
  )
);

-- post_comments: UPDATE SELECT policy
DROP POLICY IF EXISTS "Users can view comments on visible posts" ON public.post_comments;
CREATE POLICY "Users can view comments on visible posts"
ON public.post_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.posts
    WHERE posts.id = post_comments.post_id
    AND (
      posts.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships
        WHERE (
          (friendships.user_id = auth.uid() AND friendships.friend_id = posts.user_id)
          OR (friendships.friend_id = auth.uid() AND friendships.user_id = posts.user_id)
        )
        AND friendships.status = 'accepted'
      )
      OR (
        posts.visibility = 'mutual_friends'
        AND posts.user_id IN (SELECT get_mutual_friend_ids(auth.uid()))
      )
    )
  )
);

-- post_likes: UPDATE INSERT policy
DROP POLICY IF EXISTS "Users can like visible posts" ON public.post_likes;
CREATE POLICY "Users can like visible posts"
ON public.post_likes
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.posts
    WHERE posts.id = post_likes.post_id
    AND (
      posts.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships
        WHERE (
          (friendships.user_id = auth.uid() AND friendships.friend_id = posts.user_id)
          OR (friendships.friend_id = auth.uid() AND friendships.user_id = posts.user_id)
        )
        AND friendships.status = 'accepted'
      )
      OR (
        posts.visibility = 'mutual_friends'
        AND posts.user_id IN (SELECT get_mutual_friend_ids(auth.uid()))
      )
    )
  )
);

-- post_likes: UPDATE SELECT policy
DROP POLICY IF EXISTS "Users can view likes on visible posts" ON public.post_likes;
CREATE POLICY "Users can view likes on visible posts"
ON public.post_likes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.posts
    WHERE posts.id = post_likes.post_id
    AND (
      posts.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.friendships
        WHERE (
          (friendships.user_id = auth.uid() AND friendships.friend_id = posts.user_id)
          OR (friendships.friend_id = auth.uid() AND friendships.user_id = posts.user_id)
        )
        AND friendships.status = 'accepted'
      )
      OR (
        posts.visibility = 'mutual_friends'
        AND posts.user_id IN (SELECT get_mutual_friend_ids(auth.uid()))
      )
    )
  )
);
