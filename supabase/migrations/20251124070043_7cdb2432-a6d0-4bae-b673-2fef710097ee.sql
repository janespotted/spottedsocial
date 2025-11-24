-- Enable realtime for profiles table to track location changes
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- Add profiles table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;