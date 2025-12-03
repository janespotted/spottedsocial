-- Enable full row data capture for realtime on checkins table
ALTER TABLE public.checkins REPLICA IDENTITY FULL;

-- Add checkins to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkins;

-- Also ensure night_statuses has realtime enabled
ALTER TABLE public.night_statuses REPLICA IDENTITY FULL;

-- Add night_statuses to realtime publication (if not already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'night_statuses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.night_statuses;
  END IF;
END
$$;

-- Enable realtime on profiles for location updates
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Add profiles to realtime publication (if not already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END
$$;