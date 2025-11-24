-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Receiver can view their notifications
CREATE POLICY "Users can view received notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = receiver_id);

-- Sender can view sent notifications
CREATE POLICY "Senders can view sent notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = sender_id);

-- Users can insert notifications they send
CREATE POLICY "Users can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Users can update their received notifications (mark as read)
CREATE POLICY "Users can update received notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = receiver_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;