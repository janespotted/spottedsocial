-- Add visibility column to posts table
ALTER TABLE public.posts 
ADD COLUMN visibility text NOT NULL DEFAULT 'all_friends';

-- Drop the existing posts SELECT policy
DROP POLICY IF EXISTS "Posts viewable by friends" ON public.posts;

-- Create new visibility-aware SELECT policy for posts
CREATE POLICY "Posts viewable based on visibility" ON public.posts
FOR SELECT USING (
  -- Post owner can always see their own posts
  auth.uid() = user_id
  OR
  -- Check visibility setting
  (
    CASE visibility
      WHEN 'close_friends' THEN public.is_close_friend(auth.uid(), user_id)
      WHEN 'all_friends' THEN public.is_direct_friend(auth.uid(), user_id)
      WHEN 'mutual_friends' THEN public.is_mutual_friend(auth.uid(), user_id)
      ELSE false
    END
  )
  -- Also allow demo posts to be visible
  OR is_demo = true
);