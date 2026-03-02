-- Allow users to delete notifications they received (for accept/dismiss flow)
CREATE POLICY "Users can delete own received notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = receiver_id);
