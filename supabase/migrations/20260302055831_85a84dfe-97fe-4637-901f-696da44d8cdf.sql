
-- Allow senders to delete their own unread notifications (for undo functionality)
CREATE POLICY "Senders can delete own unread notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = sender_id AND is_read = false);

-- Ensure realtime is enabled for key tables (skip already-added ones)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.night_statuses;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
