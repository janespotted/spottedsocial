-- Create invite_codes table
CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text UNIQUE NOT NULL,
  uses_count integer DEFAULT 0,
  max_uses integer DEFAULT NULL,
  expires_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Create invite_uses table to track who used which invite
CREATE TABLE public.invite_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id uuid REFERENCES public.invite_codes(id) ON DELETE CASCADE NOT NULL,
  inviter_id uuid NOT NULL,
  invited_user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(invited_user_id)
);

-- Enable RLS
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_uses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for invite_codes
CREATE POLICY "Users can view own invite codes" ON public.invite_codes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create invite codes" ON public.invite_codes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own invite codes" ON public.invite_codes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view invite codes for validation" ON public.invite_codes
  FOR SELECT USING (true);

-- RLS Policies for invite_uses
CREATE POLICY "Users can view invites they sent" ON public.invite_uses
  FOR SELECT USING (auth.uid() = inviter_id);

CREATE POLICY "Anyone can insert invite uses on signup" ON public.invite_uses
  FOR INSERT WITH CHECK (true);

-- Function to process invite code on signup
CREATE OR REPLACE FUNCTION public.process_invite_code(invite_code text, new_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record record;
  inviter_profile record;
BEGIN
  -- Find the invite code
  SELECT * INTO invite_record FROM invite_codes 
  WHERE code = invite_code 
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR uses_count < max_uses);
  
  IF invite_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
  END IF;
  
  -- Check if user already used an invite
  IF EXISTS (SELECT 1 FROM invite_uses WHERE invited_user_id = new_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'User already used an invite');
  END IF;
  
  -- Create bidirectional friendship (accepted status)
  INSERT INTO friendships (user_id, friend_id, status)
  VALUES (invite_record.user_id, new_user_id, 'accepted')
  ON CONFLICT DO NOTHING;
  
  INSERT INTO friendships (user_id, friend_id, status)
  VALUES (new_user_id, invite_record.user_id, 'accepted')
  ON CONFLICT DO NOTHING;
  
  -- Record the invite use
  INSERT INTO invite_uses (invite_code_id, inviter_id, invited_user_id)
  VALUES (invite_record.id, invite_record.user_id, new_user_id);
  
  -- Increment uses count
  UPDATE invite_codes SET uses_count = uses_count + 1 WHERE id = invite_record.id;
  
  -- Get inviter profile for return
  SELECT display_name, avatar_url INTO inviter_profile FROM profiles WHERE id = invite_record.user_id;
  
  RETURN json_build_object(
    'success', true, 
    'inviter_id', invite_record.user_id,
    'inviter_name', inviter_profile.display_name,
    'inviter_avatar', inviter_profile.avatar_url
  );
END;
$$;