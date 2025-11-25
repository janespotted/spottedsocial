-- Create post_likes table
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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
        )
    )
  );

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
        )
    )
  );

CREATE POLICY "Users can unlike their own likes"
  ON public.post_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add likes_count column to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- Create function to update likes count
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET likes_count = likes_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Create trigger for post likes count
DROP TRIGGER IF EXISTS update_post_likes_count_trigger ON public.post_likes;
CREATE TRIGGER update_post_likes_count_trigger
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_likes_count();

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON public.post_likes(user_id);