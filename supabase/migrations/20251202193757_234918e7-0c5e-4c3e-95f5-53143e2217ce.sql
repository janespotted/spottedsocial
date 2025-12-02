-- Add columns to stories table for Tonight's Buzz
ALTER TABLE stories ADD COLUMN venue_id uuid REFERENCES venues(id);
ALTER TABLE stories ADD COLUMN is_public_buzz boolean DEFAULT false;
ALTER TABLE stories ADD COLUMN is_anonymous boolean DEFAULT false;

-- Create venue_buzz_messages table for text-only vibes
CREATE TABLE venue_buzz_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES venues(id),
  venue_name text NOT NULL,
  text text NOT NULL,
  emoji_vibe text,
  is_anonymous boolean DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  is_demo boolean DEFAULT false
);

-- Enable RLS on venue_buzz_messages
ALTER TABLE venue_buzz_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for venue_buzz_messages
CREATE POLICY "Authenticated users can view buzz messages"
ON venue_buzz_messages FOR SELECT
TO public
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create own buzz messages"
ON venue_buzz_messages FOR INSERT
TO public
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can delete own buzz messages"
ON venue_buzz_messages FOR DELETE
TO public
USING (auth.uid() = user_id);

-- Update RLS policy for stories to allow public viewing when is_public_buzz is true
CREATE POLICY "Public buzz stories viewable by authenticated users"
ON stories FOR SELECT
TO public
USING (
  is_public_buzz = true AND auth.uid() IS NOT NULL
);

-- Enable realtime for venue_buzz_messages
ALTER PUBLICATION supabase_realtime ADD TABLE venue_buzz_messages;