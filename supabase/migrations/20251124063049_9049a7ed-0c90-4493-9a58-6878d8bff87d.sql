-- Add new columns to yap_messages for voting and anonymous handles
ALTER TABLE yap_messages 
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS author_handle TEXT;

-- Create yap_votes table to track user votes
CREATE TABLE IF NOT EXISTS yap_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yap_id UUID NOT NULL REFERENCES yap_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(yap_id, user_id)
);

-- Enable RLS on yap_votes
ALTER TABLE yap_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies for yap_votes
CREATE POLICY "Users can view all votes"
ON yap_votes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create their own votes"
ON yap_votes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own votes"
ON yap_votes FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes"
ON yap_votes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);