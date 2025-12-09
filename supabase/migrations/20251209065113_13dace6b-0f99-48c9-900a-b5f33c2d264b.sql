-- Add group chat columns to dm_threads
ALTER TABLE dm_threads ADD COLUMN name TEXT;
ALTER TABLE dm_threads ADD COLUMN is_group BOOLEAN DEFAULT false;

-- Create function to create group threads
CREATE OR REPLACE FUNCTION create_group_thread(
  member_ids uuid[],
  group_name text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  new_thread_id uuid;
  current_user_id uuid;
  member_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Create new group thread
  INSERT INTO dm_threads (created_by, is_group, name)
  VALUES (current_user_id, true, group_name)
  RETURNING id INTO new_thread_id;
  
  -- Add creator as member
  INSERT INTO dm_thread_members (thread_id, user_id)
  VALUES (new_thread_id, current_user_id);
  
  -- Add all other members
  FOREACH member_id IN ARRAY member_ids LOOP
    INSERT INTO dm_thread_members (thread_id, user_id)
    VALUES (new_thread_id, member_id);
  END LOOP;
  
  RETURN new_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;