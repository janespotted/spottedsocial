-- Returns suggested friends (friends-of-friends) ranked by mutual friend count.
-- Runs as SECURITY DEFINER to read friendships across users (RLS blocks this client-side).

create or replace function public.get_people_you_may_know(p_user_id uuid, p_limit int default 10)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  mutual_count bigint
)
language sql
security definer
set search_path = 'public'
as $$
  with my_friends as (
    -- Get all accepted friend IDs for the requesting user
    select case when f.user_id = p_user_id then f.friend_id else f.user_id end as friend_id
    from friendships f
    where f.status = 'accepted'
      and (f.user_id = p_user_id or f.friend_id = p_user_id)
  ),
  friends_of_friends as (
    -- Get friends of my friends, excluding me and my existing friends
    select
      case when f.user_id = mf.friend_id then f.friend_id else f.user_id end as fof_id,
      mf.friend_id as via_friend
    from friendships f
    join my_friends mf on (f.user_id = mf.friend_id or f.friend_id = mf.friend_id)
    where f.status = 'accepted'
      -- Exclude the row that points back to the mutual friend themselves
      and case when f.user_id = mf.friend_id then f.friend_id else f.user_id end != mf.friend_id
      -- Exclude me
      and case when f.user_id = mf.friend_id then f.friend_id else f.user_id end != p_user_id
  ),
  ranked as (
    -- Count mutual friends per candidate, excluding existing friends
    select fof.fof_id, count(distinct fof.via_friend) as mutual_count
    from friends_of_friends fof
    where fof.fof_id not in (select friend_id from my_friends)
    group by fof.fof_id
    order by mutual_count desc
    limit p_limit
  )
  select
    r.fof_id as user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    r.mutual_count
  from ranked r
  join profiles p on p.id = r.fof_id
  where p.is_demo = false
  order by r.mutual_count desc;
$$;

grant execute on function public.get_people_you_may_know(uuid, int) to authenticated;
