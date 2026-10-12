-- Going-out participation gates live discovery, not eligibility for an explicit
-- invitation. Keep recipient discovery from becoming an oracle for others' status.
create or replace function spotted_private.social_visible(viewer uuid,owner_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
 select 1 from public.profiles v,public.profiles p
 where v.id=viewer and p.id=owner_id and not coalesce(v.is_demo,false) and not coalesce(p.is_demo,false)
 and spotted_private.location_audience(viewer,owner_id,coalesce(
   (select s.planning_visibility from public.night_statuses s where s.user_id=p.id and s.status='planning' and s.expires_at>now()),
   p.location_sharing_level)))
$$;
