create function public.get_party_invite_recipients() returns table(id uuid)
language sql stable security definer set search_path='' as $$
 select p.id from public.profiles p
 where auth.uid() is not null and not coalesce(p.is_demo,false)
 and spotted_private.direct_friend(auth.uid(),p.id)
 and spotted_private.social_visible(p.id,auth.uid())
 and exists(select 1 from public.night_statuses s where s.user_id=auth.uid() and s.status='out'
   and s.is_private_party is true and s.expires_at>now())
$$;
revoke all on function public.get_party_invite_recipients() from public,anon;
grant execute on function public.get_party_invite_recipients() to authenticated;
