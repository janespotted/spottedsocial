-- Caller-bound recipients; never read another user's unrestricted friendship graph.
create function public.get_post_share_recipients(p_post uuid)
returns table(id uuid,display_name text,avatar_url text,is_out boolean)
language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.avatar_url,public._can_see_location_unchecked(auth.uid(),p.id)
 from public.profiles p
 where auth.uid() is not null and public.can_read_post(p_post)
 and not coalesce(p.is_demo,false) and p.id<>auth.uid()
 and spotted_private.direct_friend(auth.uid(),p.id)
 and spotted_private.post_visible(p.id,p_post)
 order by p.display_name,p.id
$$;
create function public.share_post_to_dm(p_post uuid,p_recipient uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare thread uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.get_post_share_recipients(p_post) where id=p_recipient)
 then raise exception 'Post or recipient is no longer available' using errcode='42501';end if;
 thread:=public.create_dm_thread(p_recipient);
 insert into public.dm_messages(thread_id,sender_id,text)
 values(thread,auth.uid(),'[shared_post:'||p_post::text||']');
 return thread;
end $$;
revoke all on function public.get_post_share_recipients(uuid),public.share_post_to_dm(uuid,uuid) from public,anon;
grant execute on function public.get_post_share_recipients(uuid),public.share_post_to_dm(uuid,uuid) to authenticated;

-- Stop deployment for explicit review if real handles already collide. Never silently rename people.
do $$ begin
 if exists(select 1 from public.profiles where nullif(btrim(username),'') is not null
 group by lower(btrim(username)) having count(*)>1) then
 raise exception 'Resolve duplicate normalized profile usernames before applying v1_product_social_actions';end if;
end $$;
create unique index v1_profiles_unique_handle on public.profiles(lower(btrim(username)))
 where nullif(btrim(username),'') is not null;
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and lower(btrim(p_username)) ~ '^[a-z0-9_.]{3,20}$'
 and not exists(select 1 from public.profiles where lower(btrim(username))=lower(btrim(p_username)) and id<>auth.uid())
$$;
revoke all on function public.username_available(text) from public,anon;
grant execute on function public.username_available(text) to authenticated;
