-- ═════════════════════════════════════════════════════════════════════
-- Tag friends in posts (addendum v3 §9.3).
--
-- A tag is a pointer, never a grant: it must not widen who can see the
-- post. The SELECT policy therefore mirrors the post's own visibility
-- rule (close_friends / all_friends / mutual_friends), so a tagged person
-- outside the audience cannot read the tag row either — and the feed,
-- which reads tags alongside posts, shows nothing extra.
--
-- Tags die with the post: ON DELETE CASCADE, so the 5 AM reset takes them
-- with it and there is no separate expiry to keep in sync.
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.post_tags (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts(id) on delete cascade,
  tagged_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (post_id, tagged_user_id)
);

create index if not exists idx_post_tags_post on public.post_tags (post_id);
create index if not exists idx_post_tags_user on public.post_tags (tagged_user_id);

comment on table public.post_tags is
  'Friends tagged in a post. A tag never widens the post''s audience — the SELECT policy mirrors posts'' own visibility. Cascades with the post (5 AM reset).';

alter table public.post_tags enable row level security;

-- Readable exactly when the post itself is readable. Kept in step with
-- "Posts viewable based on visibility" (20260107064148).
create policy "Tags viewable with the post"
on public.post_tags
for select
using (
  exists (
    select 1 from public.posts p
    where p.id = post_tags.post_id
      and (
        p.user_id = auth.uid()
        or (
          case p.visibility
            when 'close_friends' then public.is_close_friend(auth.uid(), p.user_id)
            when 'all_friends' then public.is_direct_friend(auth.uid(), p.user_id)
            when 'mutual_friends' then public.is_mutual_friend(auth.uid(), p.user_id)
            else false
          end
        )
        or p.is_demo = true
      )
  )
);

-- Only the post's author tags people, and only their own friends: tagging
-- a stranger would put a name on a post they can't see.
create policy "Authors tag their own friends"
on public.post_tags
for insert
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_tags.post_id and p.user_id = auth.uid()
  )
  and public.is_direct_friend(auth.uid(), post_tags.tagged_user_id)
);

-- The author untags; a tagged person can remove themselves.
create policy "Author or tagged person removes a tag"
on public.post_tags
for delete
using (
  post_tags.tagged_user_id = auth.uid()
  or exists (
    select 1 from public.posts p
    where p.id = post_tags.post_id and p.user_id = auth.uid()
  )
);
