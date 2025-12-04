-- Create SECURITY DEFINER function to handle DM thread creation
CREATE OR REPLACE FUNCTION public.create_dm_thread(friend_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_thread_id uuid;
  current_user_id uuid;
BEGIN
  -- Get the current user's ID from auth
  current_user_id := auth.uid();
  
  -- Verify user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check if thread already exists between these users
  SELECT dtm1.thread_id INTO new_thread_id
  FROM dm_thread_members dtm1
  JOIN dm_thread_members dtm2 ON dtm1.thread_id = dtm2.thread_id
  WHERE dtm1.user_id = current_user_id 
    AND dtm2.user_id = friend_id
  LIMIT 1;
  
  -- If thread exists, return it
  IF new_thread_id IS NOT NULL THEN
    RETURN new_thread_id;
  END IF;
  
  -- Create new thread
  INSERT INTO dm_threads (created_by)
  VALUES (current_user_id)
  RETURNING id INTO new_thread_id;
  
  -- Add both users as members
  INSERT INTO dm_thread_members (thread_id, user_id)
  VALUES 
    (new_thread_id, current_user_id),
    (new_thread_id, friend_id);
  
  RETURN new_thread_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_dm_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_dm_thread(uuid) TO anon;