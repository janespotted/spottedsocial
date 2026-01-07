-- Add visibility column to stories table
ALTER TABLE public.stories 
ADD COLUMN visibility text NOT NULL DEFAULT 'all_friends';

-- Drop existing RLS policy for friends viewing
DROP POLICY IF EXISTS "Stories viewable by friends" ON public.stories;

-- Create new visibility-aware policy for friends viewing
CREATE POLICY "Stories viewable by friends based on visibility" 
ON public.stories 
FOR SELECT 
USING (
  -- Owner can always see their own stories
  auth.uid() = user_id
  -- Demo stories are visible
  OR is_demo = true
  -- For non-public-buzz stories (friends only), apply visibility rules
  OR (
    (is_public_buzz IS NULL OR is_public_buzz = false)
    AND CASE visibility
      WHEN 'close_friends' THEN public.is_close_friend(auth.uid(), user_id)
      WHEN 'all_friends' THEN public.is_direct_friend(auth.uid(), user_id)
      WHEN 'mutual_friends' THEN public.is_mutual_friend(auth.uid(), user_id)
      ELSE false
    END
  )
  -- Public buzz stories have their own policy - allow if is_public_buzz
  OR is_public_buzz = true
);