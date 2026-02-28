

## Fix: Missing usernames/avatars on feed posts

**Root cause**: The `posts` table has no foreign key constraint from `user_id` to `profiles.id`. Without this FK, the Supabase join syntax `profiles:user_id(display_name, username, avatar_url)` returns an empty array `[]` instead of an object. So `post.profiles?.display_name` resolves to `undefined`, rendering nothing.

**Fix**: Add a foreign key constraint from `posts.user_id` to `profiles.id`.

### Database migration
```sql
ALTER TABLE public.posts
  ADD CONSTRAINT posts_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
```

This single change makes the existing Supabase join in `useFeed.ts` (line 164-170) and `Feed.tsx` work correctly — `post.profiles` will return a single object instead of an empty array.

### Also check: `post_comments`
The same join pattern is used for comments (line 283-290 in useFeed.ts). If `post_comments` also lacks a FK to profiles, that needs the same fix:
```sql
ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id);
```

### Files changed
- **Database only** — no code changes needed. The existing queries already use the correct join syntax.

