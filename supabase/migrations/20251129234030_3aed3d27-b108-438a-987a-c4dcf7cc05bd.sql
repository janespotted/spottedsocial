-- Add score column to yap_comments
ALTER TABLE public.yap_comments ADD COLUMN score integer DEFAULT 0;

-- Create yap_comment_votes table
CREATE TABLE public.yap_comment_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.yap_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote_type text NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

-- Enable RLS
ALTER TABLE public.yap_comment_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies for yap_comment_votes
CREATE POLICY "Users can view all comment votes"
ON public.yap_comment_votes
FOR SELECT
USING (true);

CREATE POLICY "Users can create their own comment votes"
ON public.yap_comment_votes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comment votes"
ON public.yap_comment_votes
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comment votes"
ON public.yap_comment_votes
FOR DELETE
USING (auth.uid() = user_id);