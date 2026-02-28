ALTER TABLE public.venue_buzz_messages 
ADD CONSTRAINT venue_buzz_messages_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;