-- One-time wipe of all demo data to start fresh
-- Safe: only touches rows where is_demo = true or references demo profile IDs

DO $$
DECLARE
  demo_ids uuid[];
BEGIN
  -- Get all demo profile IDs
  SELECT array_agg(id) INTO demo_ids FROM profiles WHERE is_demo = true;

  IF demo_ids IS NOT NULL AND array_length(demo_ids, 1) > 0 THEN
    -- Delete from all FK-referencing tables
    DELETE FROM dm_messages WHERE thread_id IN (
      SELECT thread_id FROM dm_thread_members WHERE user_id = ANY(demo_ids)
    );
    DELETE FROM dm_thread_members WHERE user_id = ANY(demo_ids);
    DELETE FROM dm_threads WHERE id IN (
      SELECT id FROM dm_threads WHERE created_by = ANY(demo_ids)
    );
    DELETE FROM friendships WHERE user_id = ANY(demo_ids) OR friend_id = ANY(demo_ids);
    DELETE FROM close_friends WHERE user_id = ANY(demo_ids) OR close_friend_id = ANY(demo_ids);
    DELETE FROM post_likes WHERE user_id = ANY(demo_ids);
    DELETE FROM post_comments WHERE user_id = ANY(demo_ids);
    DELETE FROM plan_votes WHERE user_id = ANY(demo_ids);
    DELETE FROM plan_downs WHERE user_id = ANY(demo_ids);
    DELETE FROM plan_participants WHERE user_id = ANY(demo_ids);
    DELETE FROM event_rsvps WHERE user_id = ANY(demo_ids);
    DELETE FROM yap_votes WHERE user_id = ANY(demo_ids);
    DELETE FROM notifications WHERE sender_id = ANY(demo_ids) OR receiver_id = ANY(demo_ids);
    DELETE FROM location_events WHERE user_id = ANY(demo_ids);
    DELETE FROM event_logs WHERE user_id = ANY(demo_ids);
  END IF;

  -- Delete demo-flagged rows
  DELETE FROM events WHERE is_demo = true;
  DELETE FROM plans WHERE is_demo = true;
  DELETE FROM posts WHERE is_demo = true;
  DELETE FROM yap_messages WHERE is_demo = true;
  DELETE FROM night_statuses WHERE is_demo = true;
  DELETE FROM checkins WHERE is_demo = true;
  DELETE FROM venues WHERE is_demo = true;
  DELETE FROM profiles WHERE is_demo = true;

  RAISE NOTICE 'Demo data wiped successfully';
END;
$$;
