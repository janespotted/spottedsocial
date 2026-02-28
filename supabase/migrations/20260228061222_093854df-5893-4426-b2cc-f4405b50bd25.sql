ALTER TABLE public.posts
  ADD CONSTRAINT posts_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);

ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);