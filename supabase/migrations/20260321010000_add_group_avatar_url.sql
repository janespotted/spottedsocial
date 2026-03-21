-- Add group_avatar_url column to dm_threads for group chat pictures
ALTER TABLE public.dm_threads ADD COLUMN IF NOT EXISTS group_avatar_url TEXT;
