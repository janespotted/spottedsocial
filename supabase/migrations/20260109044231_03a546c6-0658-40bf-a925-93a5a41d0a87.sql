-- Add is_demo column to notifications table for demo data cleanup
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;