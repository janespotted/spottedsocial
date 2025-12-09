-- Make description optional in plans table
ALTER TABLE public.plans ALTER COLUMN description DROP NOT NULL;

-- Create plan_participants junction table
CREATE TABLE public.plan_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(plan_id, user_id)
);

-- Enable RLS
ALTER TABLE public.plan_participants ENABLE ROW LEVEL SECURITY;

-- Participants viewable on visible plans
CREATE POLICY "Participants viewable on visible plans" ON public.plan_participants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_id AND (
      auth.uid() = plans.user_id OR
      (plans.visibility = 'friends' AND EXISTS (
        SELECT 1 FROM friendships WHERE ((user_id = auth.uid() AND friend_id = plans.user_id) OR 
        (friend_id = auth.uid() AND user_id = plans.user_id)) AND status = 'accepted'
      )) OR
      (plans.visibility = 'close_friends' AND is_close_friend(auth.uid(), plans.user_id))
    ))
  );

-- Plan creator can add participants
CREATE POLICY "Plan owners can add participants" ON public.plan_participants
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_id AND plans.user_id = auth.uid())
  );

-- Plan creator can remove participants
CREATE POLICY "Plan owners can remove participants" ON public.plan_participants
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM plans WHERE plans.id = plan_id AND plans.user_id = auth.uid())
  );