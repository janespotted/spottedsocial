-- Read-only copy of production privacy helpers inspected 2026-10-24; fixture only.
CREATE OR REPLACE FUNCTION spotted_private.blocked(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.blocked_users where
 (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a))
$function$;

CREATE OR REPLACE FUNCTION spotted_private.direct_friend(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select a is not null and b is not null and not spotted_private.blocked(a,b)
 and exists(select 1 from public.friendships where status='accepted'
 and ((user_id=a and friend_id=b) or (user_id=b and friend_id=a)))
$function$;

CREATE OR REPLACE FUNCTION spotted_private.audience_allows(viewer uuid, owner_id uuid, audience text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select viewer is not null and owner_id is not null and not spotted_private.blocked(viewer,owner_id)
 and (viewer=owner_id or exists(select 1 from public.profiles where id=owner_id and is_demo is true) or case audience
 when 'close_friends' then spotted_private.direct_friend(viewer,owner_id) and exists(
   select 1 from public.close_friends where user_id=owner_id and close_friend_id=viewer)
 when 'all_friends' then spotted_private.direct_friend(viewer,owner_id)
 when 'mutual_friends' then spotted_private.direct_friend(viewer,owner_id) or exists(
   select 1 from public.friendships f join public.profiles p
   on p.id=case when f.user_id=owner_id then f.friend_id else f.user_id end
   where f.status='accepted' and (f.user_id=owner_id or f.friend_id=owner_id)
   and not coalesce(p.is_demo,false) and spotted_private.direct_friend(owner_id,p.id)
   and spotted_private.direct_friend(viewer,p.id))
 else false end)
$function$;

CREATE OR REPLACE FUNCTION spotted_private.location_audience(viewer uuid, owner_id uuid, audience text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select spotted_private.audience_allows(viewer,owner_id,audience) and not exists(
 select 1 from public.location_hidden where user_id=owner_id and hidden_from_id=viewer)
$function$;

CREATE OR REPLACE FUNCTION spotted_private.viewer_participates(p_viewer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.night_statuses s where s.user_id=p_viewer
   and s.status in ('out','planning') and s.expires_at>now())
$function$;

CREATE OR REPLACE FUNCTION public._can_see_location_unchecked(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (viewer_id=target_user_id or spotted_private.viewer_participates(viewer_id)) and exists(select 1 from public.night_statuses s join public.profiles p on p.id=s.user_id
 where s.user_id=target_user_id and s.status='out' and s.expires_at>now()
 and spotted_private.location_audience(viewer_id,target_user_id,p.location_sharing_level))
$function$;

CREATE OR REPLACE FUNCTION public.can_see_location(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and auth.uid()=viewer_id and public._can_see_location_unchecked(viewer_id,target_user_id)
$function$;

CREATE OR REPLACE FUNCTION public.night_start_at(p_city text, p_at timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
AS $function$
  with tz as (
    select case
      when p_city = 'la' then 'America/Los_Angeles'
      when p_city = 'lhr' then 'Asia/Karachi'
      else 'America/New_York'
    end as name
  )
  select (
    ((p_at at time zone tz.name) - interval '5 hours')::date + time '05:00'
  ) at time zone tz.name
  from tz;
$function$;
