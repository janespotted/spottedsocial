-- Create yap_comments table
CREATE TABLE IF NOT EXISTS yap_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  yap_id UUID NOT NULL REFERENCES yap_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT true,
  author_handle TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on yap_comments
ALTER TABLE yap_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for yap_comments
CREATE POLICY "Users can view all comments"
ON yap_comments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can create comments"
ON yap_comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
ON yap_comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create function to update comments count
CREATE OR REPLACE FUNCTION update_yap_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE yap_messages 
    SET comments_count = comments_count + 1
    WHERE id = NEW.yap_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE yap_messages 
    SET comments_count = GREATEST(comments_count - 1, 0)
    WHERE id = OLD.yap_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update comments count
CREATE TRIGGER update_yap_comments_count_trigger
AFTER INSERT OR DELETE ON yap_comments
FOR EACH ROW
EXECUTE FUNCTION update_yap_comments_count();