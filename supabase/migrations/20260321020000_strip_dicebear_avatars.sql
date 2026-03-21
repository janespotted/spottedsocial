-- Remove dicebear placeholder avatars from demo profiles so they show initials instead
UPDATE public.profiles
SET avatar_url = NULL
WHERE avatar_url LIKE '%dicebear.com%';
