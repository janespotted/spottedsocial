CREATE OR REPLACE FUNCTION public.get_profiles_safe()
 RETURNS TABLE(id uuid, display_name text, username text, avatar_url text, bio text, created_at timestamp with time zone, is_demo boolean, location_sharing_level text, last_known_lat double precision, last_known_lng double precision, is_out boolean, last_location_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with actor as materialized (select auth.uid() as id),
 viewer as materialized (select a.id,spotted_private.viewer_participates(a.id) as participates from actor a where a.id is not null),
 viewer_blocks as materialized (
   select b.blocked_id as id from public.blocked_users b join viewer v on b.blocker_id=v.id
   union
   select b.blocker_id as id from public.blocked_users b join viewer v on b.blocked_id=v.id
 ), viewer_edges as materialized (
   select f.friend_id as id from public.friendships f join viewer v on f.user_id=v.id where f.status='accepted'
   union
   select f.user_id as id from public.friendships f join viewer v on f.friend_id=v.id where f.status='accepted'
 ), direct_friends as materialized (
   select e.id from viewer_edges e where not exists(select 1 from viewer_blocks b where b.id=e.id)
 ), bridges as materialized (
   select p.id from direct_friends d join public.profiles p on p.id=d.id where not coalesce(p.is_demo,false)
 ), bridge_owner_edges as materialized (
   select f.friend_id as id,b.id as bridge_id from bridges b join public.friendships f on f.user_id=b.id where f.status='accepted'
   union
   select f.user_id as id,b.id as bridge_id from bridges b join public.friendships f on f.friend_id=b.id where f.status='accepted'
 ), mutual_owners as materialized (
   select distinct e.id from bridge_owner_edges e
   where not exists(select 1 from viewer_blocks b where b.id=e.id)
   and not exists (
     select 1 from public.blocked_users b
     where least(b.blocker_id,b.blocked_id)=least(e.bridge_id,e.id)
       and greatest(b.blocker_id,b.blocked_id)=greatest(e.bridge_id,e.id)
   )
 ), permissions as materialized (
   -- Preserve all basic profile rows. Evaluate graph membership once, without
   -- a privileged function call for every profile and every GPS output column.
   select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.created_at,p.is_demo,
     p.location_sharing_level,p.last_known_lat,p.last_known_lng,p.last_location_at,
     p.city,p.is_out as owner_out,not coalesce(s.is_private_party,false) as public_place,
     coalesce((v.id=p.id or v.participates) and s.status='out' and s.expires_at>now() and blocked.id is null and hidden.id is null
       and (v.id=p.id or p.is_demo is true or case p.location_sharing_level
         when 'close_friends' then direct.id is not null and close_member.user_id is not null
         when 'all_friends' then direct.id is not null
         when 'mutual_friends' then direct.id is not null or mutual.id is not null
         else false end),false) as allowed_out
   from public.profiles p cross join viewer v
   left join public.night_statuses s on s.user_id=p.id
   left join viewer_blocks blocked on blocked.id=p.id
   left join direct_friends direct on direct.id=p.id
   left join mutual_owners mutual on mutual.id=p.id
   left join public.close_friends close_member on close_member.user_id=p.id and close_member.close_friend_id=v.id
   left join public.location_hidden hidden on hidden.user_id=p.id and hidden.hidden_from_id=v.id
 )
 select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.created_at,p.is_demo,p.location_sharing_level,
   case when allowed.gps then p.last_known_lat end,
   case when allowed.gps then p.last_known_lng end,
   p.allowed_out,case when allowed.gps then p.last_location_at end
 from permissions p cross join lateral (
   select p.allowed_out and p.owner_out is true
     and p.last_location_at>=public.night_start_at(p.city)
     and p.last_location_at<=now()+interval '30 seconds'
     and p.public_place as gps
 ) allowed
$function$
