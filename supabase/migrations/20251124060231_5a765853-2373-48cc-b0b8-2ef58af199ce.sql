-- Create stories table
CREATE TABLE public.stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_demo BOOLEAN DEFAULT false
);

-- Create story_views table to track who viewed which stories
CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Stories policies: viewable by friends
CREATE POLICY "Stories viewable by friends"
ON public.stories
FOR SELECT
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM friendships
    WHERE (
      (friendships.user_id = auth.uid() AND friendships.friend_id = stories.user_id AND friendships.status = 'accepted') OR
      (friendships.friend_id = auth.uid() AND friendships.user_id = stories.user_id AND friendships.status = 'accepted')
    )
  )
);

CREATE POLICY "Users can create own stories"
ON public.stories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories"
ON public.stories
FOR DELETE
USING (auth.uid() = user_id);

-- Story views policies
CREATE POLICY "Users can view story views"
ON public.story_views
FOR SELECT
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM stories
    WHERE stories.id = story_views.story_id AND stories.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create story views"
ON public.story_views
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_stories_user_id ON stories(user_id);
CREATE INDEX idx_stories_expires_at ON stories(expires_at);
CREATE INDEX idx_story_views_story_id ON story_views(story_id);
CREATE INDEX idx_story_views_user_id ON story_views(user_id);