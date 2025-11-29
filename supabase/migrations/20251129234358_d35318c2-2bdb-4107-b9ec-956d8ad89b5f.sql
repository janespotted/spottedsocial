-- Add is_demo column to yap_comments table
ALTER TABLE public.yap_comments ADD COLUMN is_demo boolean DEFAULT false;