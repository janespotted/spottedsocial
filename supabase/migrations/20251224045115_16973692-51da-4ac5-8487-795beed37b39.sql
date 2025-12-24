-- Fix: Add blocked users check to process_invite_code function
-- This prevents creating friendships when either party has blocked the other

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
  
  -- SECURITY FIX: Check if either user has blocked the other
  -- This prevents creating friendships through invite codes when there's a block
  IF EXISTS (
    SELECT 1 FROM blocked_users 
    WHERE (blocker_id = invite_record.user_id AND blocked_id = new_user_id)
       OR (blocker_id = new_user_id AND blocked_id = invite_record.user_id)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Cannot create friendship');
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