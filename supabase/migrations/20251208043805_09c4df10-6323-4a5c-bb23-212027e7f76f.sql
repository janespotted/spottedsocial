-- Create function to notify inviter when someone uses their invite
CREATE OR REPLACE FUNCTION public.notify_inviter_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invited_user_name TEXT;
BEGIN
  -- Get the new user's display name
  SELECT display_name INTO invited_user_name
  FROM profiles WHERE id = NEW.invited_user_id;

  -- Create notification for the inviter
  INSERT INTO notifications (sender_id, receiver_id, type, message)
  VALUES (
    NEW.invited_user_id,
    NEW.inviter_id,
    'invite_accepted',
    COALESCE(invited_user_name, 'Someone') || ' joined Spotted from your invite! 🎉'
  );

  RETURN NEW;
END;
$$;

-- Create trigger on invite_uses table
DROP TRIGGER IF EXISTS on_invite_used ON public.invite_uses;
CREATE TRIGGER on_invite_used
  AFTER INSERT ON public.invite_uses
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inviter_on_signup();