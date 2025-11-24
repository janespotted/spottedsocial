-- Create enum for night status
CREATE TYPE public.night_status_enum AS ENUM ('out', 'heading_out', 'home');

-- Create enum for friendship status
CREATE TYPE public.friendship_status_enum AS ENUM ('pending', 'accepted', 'blocked');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  home_city TEXT,
  bio TEXT,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create friendships table
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.friendship_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

-- Create night_statuses table
CREATE TABLE public.night_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.night_status_enum NOT NULL DEFAULT 'home',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  venue_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Create posts table (ephemeral newsfeed)
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  image_url TEXT,
  venue_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create dm_threads table
CREATE TABLE public.dm_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create dm_thread_members table
CREATE TABLE public.dm_thread_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE(thread_id, user_id)
);

-- Create dm_messages table
CREATE TABLE public.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create yap_messages table (venue chat)
CREATE TABLE public.yap_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_anonymous BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create checkins table
CREATE TABLE public.checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_thread_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for friendships
CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can create friendships" ON public.friendships
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own friendships" ON public.friendships
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own friendships" ON public.friendships
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- RLS Policies for night_statuses
CREATE POLICY "Night statuses viewable by friends" ON public.night_statuses
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE (user_id = auth.uid() AND friend_id = night_statuses.user_id AND status = 'accepted')
         OR (friend_id = auth.uid() AND user_id = night_statuses.user_id AND status = 'accepted')
    )
  );

CREATE POLICY "Users can manage own status" ON public.night_statuses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policies for posts
CREATE POLICY "Posts viewable by friends" ON public.posts
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE (user_id = auth.uid() AND friend_id = posts.user_id AND status = 'accepted')
         OR (friend_id = auth.uid() AND user_id = posts.user_id AND status = 'accepted')
    )
  );

CREATE POLICY "Users can create own posts" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON public.posts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for DM threads
CREATE POLICY "Users can view own threads" ON public.dm_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.dm_thread_members
      WHERE thread_id = dm_threads.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create threads" ON public.dm_threads
  FOR INSERT WITH CHECK (true);

-- RLS Policies for dm_thread_members
CREATE POLICY "Users can view thread members" ON public.dm_thread_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.dm_thread_members AS dtm
      WHERE dtm.thread_id = dm_thread_members.thread_id AND dtm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add thread members" ON public.dm_thread_members
  FOR INSERT WITH CHECK (true);

-- RLS Policies for dm_messages
CREATE POLICY "Users can view messages in own threads" ON public.dm_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.dm_thread_members
      WHERE thread_id = dm_messages.thread_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages" ON public.dm_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.dm_thread_members
      WHERE thread_id = dm_messages.thread_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for yap_messages
CREATE POLICY "Yap messages viewable by all authenticated users" ON public.yap_messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create yap messages" ON public.yap_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own yap messages" ON public.yap_messages
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for checkins
CREATE POLICY "Checkins viewable by friends" ON public.checkins
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE (user_id = auth.uid() AND friend_id = checkins.user_id AND status = 'accepted')
         OR (friend_id = auth.uid() AND user_id = checkins.user_id AND status = 'accepted')
    )
  );

CREATE POLICY "Users can create own checkins" ON public.checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8))
  );
  RETURN new;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for better performance
CREATE INDEX idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX idx_friendships_status ON public.friendships(status);
CREATE INDEX idx_night_statuses_user_id ON public.night_statuses(user_id);
CREATE INDEX idx_night_statuses_expires_at ON public.night_statuses(expires_at);
CREATE INDEX idx_posts_user_id ON public.posts(user_id);
CREATE INDEX idx_posts_expires_at ON public.posts(expires_at);
CREATE INDEX idx_dm_thread_members_thread_id ON public.dm_thread_members(thread_id);
CREATE INDEX idx_dm_thread_members_user_id ON public.dm_thread_members(user_id);
CREATE INDEX idx_dm_messages_thread_id ON public.dm_messages(thread_id);
CREATE INDEX idx_yap_messages_venue_name ON public.yap_messages(venue_name);
CREATE INDEX idx_yap_messages_expires_at ON public.yap_messages(expires_at);
CREATE INDEX idx_checkins_user_id ON public.checkins(user_id);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.night_statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.yap_messages;