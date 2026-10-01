-- Requires v1_privacy_authorization. No network/provider mutations in this migration.
begin;
alter table public.posts add column mux_signed boolean not null default false;
update storage.buckets set public=false where id in ('post-images','yap-media');

-- Supabase signed URLs are bearer credentials. V1 uses an authenticated gateway
-- instead, so clients may not directly download OR mint Storage signed URLs.
create policy v1_private_media_no_direct_reads on storage.objects as restrictive
 for select to public using(bucket_id not in ('post-images','yap-media'));
create policy v1_private_media_immutable on storage.objects as restrictive
 for update to public using(bucket_id not in ('post-images','yap-media'))
 with check(bucket_id not in ('post-images','yap-media'));

create function spotted_private.storage_key(value text) returns text
language sql immutable set search_path='' as $$
 select case
 when value is null or value='' then null
 when value ~ '^https?://' then case when value ~ '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/post-images/'
   then split_part(regexp_replace(value,'^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/post-images/',''),'?',1) end
 when value !~ '(^/|(^|/)\.\.(/|$))' then value end
$$;
create index v1_post_image_lookup on public.posts(spotted_private.storage_key(image_url));
create index v1_dm_image_lookup on public.dm_messages(spotted_private.storage_key(image_url));
create index v1_group_image_lookup on public.dm_threads(spotted_private.storage_key(group_avatar_url));
create index v1_mux_playback_lookup on public.posts(mux_playback_id) where mux_playback_id is not null;

create function spotted_private.media_post_visible(viewer uuid,p public.posts) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p.user_id) and
 (spotted_private.post_visible(viewer,p.id) or
  (viewer=p.user_id and p.created_at>now()-interval '36 hours'))
$$;
create function public.private_media_target(p_path text default null,p_playback_id text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); media_post public.posts; key text;
begin
 if me is null or not exists(select 1 from public.profiles where id=me) then return null;end if;
 if p_playback_id is not null then
   select * into media_post from public.posts where mux_playback_id=p_playback_id and mux_signed is true
     and spotted_private.post_visible(me,id) order by id limit 1;
   if found then return jsonb_build_object('post_id',media_post.id,'playback_id',media_post.mux_playback_id,'expires_at',media_post.expires_at);end if;
   return null;
 end if;
 key:=spotted_private.storage_key(p_path);
 if key is null or key<>p_path then return null;end if;
 if exists(select 1 from public.posts p where spotted_private.storage_key(p.image_url)=key and split_part(key,'/',1)=p.user_id::text and spotted_private.media_post_visible(me,p))
 or exists(select 1 from public.dm_messages m join public.profiles sender on sender.id=m.sender_id
   where spotted_private.storage_key(m.image_url)=key and split_part(key,'/',1)=m.sender_id::text and public.user_is_thread_member(m.thread_id)
   and not spotted_private.blocked(me,m.sender_id)
   and m.created_at>=public.night_start_at((select city from public.profiles where id=me)))
 or exists(select 1 from public.dm_threads t where t.is_group is true
   and spotted_private.storage_key(t.group_avatar_url)=key and split_part(key,'/',1)='group-avatars' and split_part(key,'/',2)=t.id::text and public.user_is_thread_member(t.id)) then
   return jsonb_build_object('bucket','post-images','path',key);
 end if;
 return null;
end $$;

-- Retain provider state before the post exists, and bind every upload to its owner.
create table public.mux_uploads(
 upload_id text primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 asset_id text, playback_id text, status text not null default 'preparing',
 width integer,height integer,created_at timestamptz not null default now()
);
alter table public.mux_uploads enable row level security;
revoke all on public.mux_uploads from public,anon,authenticated;
grant select on public.mux_uploads to authenticated;
grant all on public.mux_uploads to service_role;
create policy own_mux_upload on public.mux_uploads for select to authenticated using(user_id=auth.uid());

create table public.media_object_deletions(
 bucket_id text not null,name text not null,queued_at timestamptz not null default now(),
 attempts integer not null default 0,last_error text,primary key(bucket_id,name)
);
alter table public.media_object_deletions enable row level security;
revoke all on public.media_object_deletions from public,anon,authenticated;
grant all on public.media_object_deletions to service_role;

create function public.guard_v1_media_owner() returns trigger
language plpgsql security definer set search_path='' as $$
declare u public.mux_uploads; key text;
begin
 -- Detect untrusted API writes via the session role, not current_user inside a definer.
 if current_setting('role',true) in ('anon','authenticated') then
   if tg_op='UPDATE' and (new.user_id<>old.user_id or new.mux_upload_id is distinct from old.mux_upload_id
     or new.mux_asset_id is distinct from old.mux_asset_id or new.mux_playback_id is distinct from old.mux_playback_id
     or new.mux_signed is distinct from old.mux_signed) then raise exception 'Media identity is service managed';end if;
   if tg_op='INSERT' then
     if new.mux_asset_id is not null or new.mux_playback_id is not null or new.mux_signed then raise exception 'Invalid media identity';end if;
     if new.mux_upload_id is not null then
       select * into u from public.mux_uploads where upload_id=new.mux_upload_id and user_id=auth.uid();
       if not found then raise exception 'Upload does not belong to caller';end if;
       new.mux_asset_id:=u.asset_id;new.mux_playback_id:=u.playback_id;new.mux_status:=u.status;
       new.mux_signed:=u.playback_id is not null;new.media_width:=u.width;new.media_height:=u.height;
     end if;
   end if;
   if new.image_url is not null then
     key:=spotted_private.storage_key(new.image_url);
     if key is null or split_part(key,'/',1)<>auth.uid()::text then raise exception 'Media path does not belong to caller';end if;
     if exists(select 1 from public.media_object_deletions where bucket_id='post-images' and name=key) then raise exception 'Upload expired; upload a new object';end if;
     new.image_url:=key;
   end if;
 end if;
 return new;
end $$;
create trigger v1_post_media_owner before insert or update on public.posts for each row execute function public.guard_v1_media_owner();
create unique index v1_post_mux_upload on public.posts(mux_upload_id) where mux_upload_id is not null;

-- Copying another sender's object path into one's own thread must not grant access.
create function public.guard_dm_media_owner() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true) in ('anon','authenticated') and new.image_url is not null then
  if spotted_private.storage_key(new.image_url) is null or split_part(spotted_private.storage_key(new.image_url),'/',1)<>auth.uid()::text then raise exception 'Media path does not belong to caller';end if;
  new.image_url:=spotted_private.storage_key(new.image_url);
  if exists(select 1 from public.media_object_deletions where bucket_id='post-images' and name=new.image_url) then raise exception 'Upload expired; upload a new object';end if;
 end if;
 return new;
end $$;
create trigger v1_dm_media_owner before insert or update on public.dm_messages for each row execute function public.guard_dm_media_owner();

create function spotted_private.group_media_writer(key text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dm_threads t where t.is_group is true
 and split_part(key,'/',1)='group-avatars' and split_part(key,'/',2)=t.id::text and public.user_is_thread_member(t.id))
$$;
create function public.can_upload_v1_media(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid())
 and p_name=spotted_private.storage_key(p_name)
 and (split_part(p_name,'/',1)=auth.uid()::text or spotted_private.group_media_writer(p_name))
$$;
create policy v1_post_upload_guard on storage.objects as restrictive for insert to public
 with check(bucket_id<>'post-images' or public.can_upload_v1_media(name));
create policy v1_group_upload on storage.objects for insert to authenticated
 with check(bucket_id='post-images' and public.can_upload_v1_media(name));

create function public.guard_group_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true) in ('anon','authenticated') then
   if new.id<>old.id or new.created_by is distinct from old.created_by or new.is_group is distinct from old.is_group then raise exception 'Thread identity is immutable';end if;
   if new.group_avatar_url is distinct from old.group_avatar_url and
     (new.group_avatar_url is null or split_part(new.group_avatar_url,'/',1)<>'group-avatars' or split_part(new.group_avatar_url,'/',2)<>old.id::text) then raise exception 'Invalid group media path';end if;
   if exists(select 1 from public.media_object_deletions where bucket_id='post-images' and name=new.group_avatar_url) then raise exception 'Upload expired; upload a new object';end if;
 end if;
 return new;
end $$;
create trigger v1_group_identity before update on public.dm_threads for each row execute function public.guard_group_identity();
create policy v1_group_edit on public.dm_threads for update to authenticated
 using(is_group is true and public.user_is_thread_member(id)) with check(is_group is true and public.user_is_thread_member(id));

-- Storage deletion must use the Storage API, not DELETE storage.objects. Queue
-- exact keys when parents disappear and sweep abandoned uploads after 24 hours.
create function spotted_private.media_referenced(key text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.posts p join public.profiles u on u.id=p.user_id where spotted_private.storage_key(p.image_url)=key)
 or exists(select 1 from public.dm_messages m join public.profiles u on u.id=m.sender_id where spotted_private.storage_key(m.image_url)=key)
 or exists(select 1 from public.dm_threads t where spotted_private.storage_key(t.group_avatar_url)=key
 and exists(select 1 from public.dm_thread_members where thread_id=t.id))
$$;
create function spotted_private.queue_media_delete() returns trigger
language plpgsql security definer set search_path='' as $$
declare key text;
begin
 if tg_table_name='profiles' then
   insert into public.media_object_deletions(bucket_id,name) select bucket_id,name from storage.objects
   where bucket_id in ('post-images','avatars','yap-media') and
    (split_part(name,'/',1)=old.id::text or name like old.id::text||'-%') on conflict do nothing;
 elsif tg_table_name='dm_threads' then
   key:=spotted_private.storage_key(old.group_avatar_url);
   if tg_op='UPDATE' and old.group_avatar_url is not distinct from new.group_avatar_url then return null;end if;
 else
   key:=spotted_private.storage_key(old.image_url);
   if tg_op='UPDATE' and old.image_url is not distinct from new.image_url then return null;end if;
 end if;
 if key is not null then insert into public.media_object_deletions(bucket_id,name) values('post-images',key) on conflict do nothing;end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
create trigger v1_post_media_cleanup after delete or update on public.posts for each row execute function spotted_private.queue_media_delete();
create trigger v1_dm_media_cleanup after delete or update on public.dm_messages for each row execute function spotted_private.queue_media_delete();
create trigger v1_group_media_cleanup after delete or update on public.dm_threads for each row execute function spotted_private.queue_media_delete();
create trigger v1_account_media_cleanup before delete on public.profiles for each row execute function spotted_private.queue_media_delete();

create function spotted_private.queue_abandoned_mux_upload() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.asset_id is not null and not exists(select 1 from public.posts where mux_asset_id=old.asset_id) then
  insert into public.mux_asset_deletions(asset_id) values(old.asset_id) on conflict do nothing;
 end if;
 return old;
end $$;
create trigger v1_mux_upload_cleanup before delete on public.mux_uploads for each row execute function spotted_private.queue_abandoned_mux_upload();

create function public.pending_private_media_cleanup() returns setof public.media_object_deletions
language plpgsql security definer set search_path='' as $$
begin
 delete from public.mux_uploads u where u.created_at<now()-interval '24 hours' and not exists(select 1 from public.posts p where p.mux_upload_id=u.upload_id);
 insert into public.media_object_deletions(bucket_id,name)
 select o.bucket_id,o.name from storage.objects o where o.bucket_id='post-images' and o.created_at<now()-interval '24 hours'
 and not spotted_private.media_referenced(o.name) on conflict do nothing;
 return query select q.* from public.media_object_deletions q where (q.bucket_id<>'post-images' or not spotted_private.media_referenced(q.name)) order by q.attempts,q.queued_at limit 100;
end $$;
-- Operator-only atomic path rotation. Copy with the Storage API first, then
-- commit all parent references together, then delete the old Storage object.
create function public.replace_private_media_path(p_old text,p_new text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_old is null or p_new is null or p_old=p_new or p_new<>spotted_private.storage_key(p_new)
 or split_part(p_old,'/',1)<>split_part(p_new,'/',1)
 or (split_part(p_old,'/',1)='group-avatars' and split_part(p_old,'/',2)<>split_part(p_new,'/',2)) then raise exception 'Invalid media rotation';end if;
 if not exists(select 1 from storage.objects where bucket_id='post-images' and name=p_new) then raise exception 'Copy the new object before rotating';end if;
 update public.posts set image_url=p_new where spotted_private.storage_key(image_url)=p_old;
 update public.dm_messages set image_url=p_new where spotted_private.storage_key(image_url)=p_old;
 update public.dm_threads set group_avatar_url=p_new where spotted_private.storage_key(group_avatar_url)=p_old;
 insert into public.media_object_deletions(bucket_id,name) values('post-images',p_old) on conflict do nothing;
end $$;
revoke all on function public.replace_private_media_path(text,text) from public,anon,authenticated;
grant execute on function public.replace_private_media_path(text,text) to service_role;

create function spotted_private.invoke_media_cleanup() returns void
language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='spotted_push_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='spotted_push_service_key';
 if endpoint is null or secret is null then return;end if;
 perform net.http_post(url:=endpoint||'/functions/v1/private-media-cleanup',
 headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}'::jsonb);
end $$;
select cron.schedule('spotted-private-media-cleanup','17 * * * *','select spotted_private.invoke_media_cleanup()');

revoke all on all functions in schema spotted_private from public,anon,authenticated;
-- Index maintenance invokes this pure text normalizer as the writer. It has
-- no data access or authorization capability; all other private helpers stay sealed.
grant execute on function spotted_private.storage_key(text) to authenticated,service_role;
revoke all on function public.private_media_target(text,text),public.can_upload_v1_media(text) from public,anon;
grant execute on function public.private_media_target(text,text),public.can_upload_v1_media(text) to authenticated;
revoke all on function public.pending_private_media_cleanup() from public,anon,authenticated;
grant execute on function public.pending_private_media_cleanup() to service_role;
revoke all on function public.guard_v1_media_owner(),public.guard_group_identity(),public.guard_dm_media_owner() from public,anon,authenticated;
commit;
