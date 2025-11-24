-- Add comments_count column to posts table
ALTER TABLE public.posts ADD COLUMN comments_count integer DEFAULT 0;

-- Create post_comments table
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT post_comments_text_length CHECK (char_length(text) > 0 AND char_length(text) <= 500)
);

-- Enable RLS
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for post_comments
-- Users can view comments on posts they can see (from friends or own posts)
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
          (friendships.user_id = auth.uid() AND friendships.friend_id = posts.user_id AND friendships.status = 'accepted')
          OR (friendships.friend_id = auth.uid() AND friendships.user_id = posts.user_id AND friendships.status = 'accepted')
        )
      )
    )
  )
);

-- Users can create comments on posts they can see
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
          (friendships.user_id = auth.uid() AND friendships.friend_id = posts.user_id AND friendships.status = 'accepted')
          OR (friendships.friend_id = auth.uid() AND friendships.user_id = posts.user_id AND friendships.status = 'accepted')
        )
      )
    )
  )
);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
ON public.post_comments
FOR DELETE
USING (auth.uid() = user_id);

-- Create function to update posts comments_count
CREATE OR REPLACE FUNCTION public.update_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET comments_count = comments_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger for automatic comments_count updates
CREATE TRIGGER update_post_comments_count_trigger
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_post_comments_count();