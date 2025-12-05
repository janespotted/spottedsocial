-- =============================================
-- CRITICAL SECURITY FIX: Profiles Table Access
-- =============================================

-- Drop the overly permissive anonymous policy
DROP POLICY IF EXISTS "Profiles basic viewable by anon" ON profiles;

-- Keep authenticated policy but it will now require auth
-- The sensitive fields should only be accessed via get_profile_safe functions

-- =============================================
-- CRITICAL SECURITY FIX: Invite Codes Exposure  
-- =============================================

-- Drop the dangerous public read policy
DROP POLICY IF EXISTS "Anyone can view invite codes for validation" ON invite_codes;

-- Create a secure validation function that returns only what's needed
-- Does not expose code values or internal IDs to unauthorized users
CREATE OR REPLACE FUNCTION public.validate_invite_code(code_to_check text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record RECORD;
  inviter_profile RECORD;
BEGIN
  -- Find the invite code
  SELECT id, user_id, uses_count, max_uses, expires_at
  INTO invite_record
  FROM invite_codes
  WHERE code = code_to_check;
  
  IF invite_record IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code not found');
  END IF;
  
  IF invite_record.expires_at IS NOT NULL AND invite_record.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code expired');
  END IF;
  
  IF invite_record.max_uses IS NOT NULL AND invite_record.uses_count >= invite_record.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Code fully used');
  END IF;
  
  -- Get inviter profile (only public-safe fields)
  SELECT display_name, avatar_url, username
  INTO inviter_profile
  FROM profiles
  WHERE id = invite_record.user_id;
  
  IF inviter_profile IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Inviter not found');
  END IF;
  
  -- Return validation result with safe inviter info
  RETURN jsonb_build_object(
    'valid', true,
    'inviter_display_name', inviter_profile.display_name,
    'inviter_avatar_url', inviter_profile.avatar_url,
    'inviter_username', inviter_profile.username
  );
END;
$$;

-- Grant execute to anyone (needed for signup flow before user is authenticated)
GRANT EXECUTE ON FUNCTION public.validate_invite_code(text) TO anon, authenticated;