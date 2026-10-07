-- Morning After: video posts join the recap's pictures (as their poster).
-- A video post lives on Mux, not Storage, so the recap row keeps the post's
-- signed playback id and asset id instead of a storage key, and the asset is
-- kept alive while a recap points at it — the same rule as a photo's file
-- (media_referenced): the last reference to go queues the deletion.
begin;

-- ── 1. A recap picture is a Storage photo OR a Mux video ─────────────────
alter table public.night_recap_photos alter column storage_key drop not null;
alter table public.night_recap_photos add column if not exists mux_playback_id text;
alter table public.night_recap_photos add column if not exists mux_asset_id text;
alter table public.night_recap_photos add constraint night_recap_photos_one_media
 check ((storage_key is null) <> (mux_playback_id is null));
create unique index if not exists night_recap_photos_playback
 on public.night_recap_photos(recap_id,mux_playback_id) where mux_playback_id is not null;
create index if not exists night_recap_photos_asset
 on public.night_recap_photos(mux_asset_id) where mux_asset_id is not null;

-- ── 2. Keep the Mux asset while a recap needs it ─────────────────────────
-- The recap is built BEFORE the reset deletes the post, so when the post
-- goes the recap still holds the asset: don't queue it. When the recap
-- expires (or a tester's preview is replaced), queue it only if no post and
-- no other recap still uses it.
create or replace function spotted_private.queue_recap_photo_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.storage_key is not null then
  insert into public.media_object_deletions(bucket_id,name) values('post-images',old.storage_key) on conflict do nothing;
 end if;
 if old.mux_asset_id is not null
  and not exists(select 1 from public.posts where mux_asset_id=old.mux_asset_id)
  and not exists(select 1 from public.night_recap_photos where mux_asset_id=old.mux_asset_id and id<>old.id) then
  insert into public.mux_asset_deletions(asset_id) values(old.mux_asset_id) on conflict do nothing;
 end if;
 return old;
end $$;

create or replace function public.queue_mux_asset_deletion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.mux_asset_id is not null
     and not exists (select 1 from night_recap_photos r where r.mux_asset_id = old.mux_asset_id) then
    insert into mux_asset_deletions (asset_id)
    values (old.mux_asset_id)
    on conflict (asset_id) do nothing;
  end if;
  return old;
end;
$$;

-- The 24-hour sweep of finished uploads would otherwise queue the asset
-- once the post is gone, recap or not.
create or replace function spotted_private.queue_abandoned_mux_upload() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.asset_id is not null and not exists(select 1 from public.posts where mux_asset_id=old.asset_id)
  and not exists(select 1 from public.night_recap_photos where mux_asset_id=old.asset_id) then
  insert into public.mux_asset_deletions(asset_id) values(old.asset_id) on conflict do nothing;
 end if;
 return old;
end $$;

-- ── 3. Serve a recap video's poster to its owner only ────────────────────
create or replace function public.private_media_target(p_path text default null,p_playback_id text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); media_post public.posts; key text; recap_expiry timestamptz;
begin
 if me is null or not exists(select 1 from public.profiles where id=me) then return null;end if;
 if p_playback_id is not null then
   select * into media_post from public.posts where mux_playback_id=p_playback_id and mux_signed is true
     and spotted_private.post_visible(me,id) order by id limit 1;
   if found then return jsonb_build_object('post_id',media_post.id,'playback_id',media_post.mux_playback_id,'expires_at',media_post.expires_at);end if;
   select max(n.expires_at) into recap_expiry from public.night_recap_photos r join public.night_recaps n on n.id=r.recap_id
     where r.mux_playback_id=p_playback_id and r.user_id=me and n.user_id=me and n.expires_at>now();
   if recap_expiry is not null then
     return jsonb_build_object('playback_id',p_playback_id,'expires_at',recap_expiry);
   end if;
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
   and spotted_private.storage_key(t.group_avatar_url)=key and split_part(key,'/',1)='group-avatars' and split_part(key,'/',2)=t.id::text and public.user_is_thread_member(t.id))
 or exists(select 1 from public.night_recap_photos r join public.night_recaps n on n.id=r.recap_id
   where r.storage_key=key and r.user_id=me and n.user_id=me and split_part(key,'/',1)=me::text and n.expires_at>now()) then
   return jsonb_build_object('bucket','post-images','path',key);
 end if;
 return null;
end $$;

-- ── 4. Build: photo AND video posts, in the order they were posted ───────
create or replace function spotted_private.build_night_recap(p_user uuid,p_start timestamptz,p_end timestamptz,
 p_night date,p_preview boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; c text;
begin
 select city into c from public.profiles where id=p_user and not coalesce(is_demo,false);
 if not found then return null;end if;
 -- A tester's preview gives way to the real recap (and to a fresh preview)
 delete from public.night_recaps where user_id=p_user and night_date=p_night and is_preview;
 if exists(select 1 from public.night_recaps where user_id=p_user and night_date=p_night) then return null;end if;

 if not exists(select 1 from public.checkins k where k.user_id=p_user and k.verified and k.started_at>=p_start and k.started_at<p_end)
 and not exists(select 1 from public.posts p where p.user_id=p_user and p.created_at>=p_start and p.created_at<p_end
   and ((coalesce(p.media_type,'image')='image' and spotted_private.storage_key(p.image_url) is not null)
    or (p.media_type='video' and p.mux_signed is true and p.mux_playback_id is not null and p.mux_asset_id is not null))) then
  return null;
 end if;

 insert into public.night_recaps(user_id,city,night_date,is_preview,expires_at)
 values(p_user,c,p_night,p_preview,spotted_private.next_reset_at(p_user)) returning id into rid;

 -- Stops: consecutive check-ins at the same venue are one stop. "Until" only
 -- when every piece ended inside the night (a departure or status change);
 -- an open one, or one the reset closes, has no reliable departure.
 insert into public.night_recap_stops(recap_id,position,venue_id,venue_name,neighborhood,arrived_at,left_at)
 select rid,row_number() over(order by g.arrived),g.venue_id,g.venue_name,v.neighborhood,g.arrived,g.left_at
 from (
  select s.grp,min(s.venue_id::text)::uuid venue_id,min(s.venue_name) venue_name,min(s.started_at) arrived,
   case when bool_and(s.ended_at is not null and s.ended_at<p_end) then max(s.ended_at) end left_at
  from (
   select k.*,sum(case when k.venue_id is not distinct from k.prev_venue then 0 else 1 end) over(order by k.started_at) grp
   from (select ck.venue_id,coalesce(ck.venue_name,'') venue_name,ck.started_at,ck.ended_at,
     lag(ck.venue_id) over(order by ck.started_at) prev_venue
    from public.checkins ck where ck.user_id=p_user and ck.verified and ck.started_at>=p_start and ck.started_at<p_end) k
  ) s group by s.grp
 ) g left join public.venues v on v.id=g.venue_id;

 -- Pictures: the user's own photo and video posts from the night. A photo
 -- copies the storage key, a video its Mux playback + asset id; the post
 -- itself is still deleted by the reset, its media kept for the recap.
 insert into public.night_recap_photos(recap_id,user_id,storage_key,mux_playback_id,mux_asset_id,width,height,thumbhash,taken_at,source)
 select rid,p_user,m.k,m.playback,m.asset,m.w,m.h,m.hash,m.at,'post'
 from (
  select x.k,null::text playback,null::text asset,p.media_width w,p.media_height h,p.media_hash hash,p.created_at at
  from public.posts p cross join lateral (select spotted_private.storage_key(p.image_url) k) x
  where p.user_id=p_user and p.created_at>=p_start and p.created_at<p_end and coalesce(p.media_type,'image')='image'
   and x.k is not null and split_part(x.k,'/',1)=p_user::text
  union all
  select null,p.mux_playback_id,p.mux_asset_id,p.media_width,p.media_height,p.media_hash,p.created_at
  from public.posts p
  where p.user_id=p_user and p.created_at>=p_start and p.created_at<p_end and p.media_type='video'
   and p.mux_signed is true and p.mux_playback_id is not null and p.mux_asset_id is not null
 ) m
 order by m.at limit 9
 on conflict do nothing;

 -- Crossed paths: a direct friend's verified check-in at the same venue,
 -- overlapping by ≥ 10 minutes, that this user was allowed to see — the
 -- friend's audience tier, blocks and hidden-from list (location_audience),
 -- never a friend who ended the night on Stop sharing. An open check-in
 -- counts until its last confirmed fix. Private parties never create
 -- check-ins, so they can't appear.
 insert into public.night_recap_people(recap_id,friend_id,venue_id,venue_name,overlap_start,overlap_end)
 select distinct on (f.user_id) rid,f.user_id,mine.venue_id,mine.venue_name,
  greatest(mine.s,f.started_at),least(mine.e,fe.e)
 from (select ck.venue_id,coalesce(v.name,ck.venue_name) venue_name,ck.started_at s,
   least(coalesce(ck.ended_at,greatest(ck.last_updated_at,ck.started_at)),p_end) e
  from public.checkins ck left join public.venues v on v.id=ck.venue_id
  where ck.user_id=p_user and ck.verified and ck.venue_id is not null and ck.started_at>=p_start and ck.started_at<p_end) mine
 join public.checkins f on f.venue_id=mine.venue_id and f.user_id<>p_user and f.verified
  and f.started_at<p_end and f.started_at<mine.e
 cross join lateral (select least(coalesce(f.ended_at,greatest(f.last_updated_at,f.started_at)),p_end) e) fe
 join public.profiles fp on fp.id=f.user_id and not coalesce(fp.is_demo,false)
 where least(mine.e,fe.e)-greatest(mine.s,f.started_at)>=interval '10 minutes'
  and spotted_private.direct_friend(p_user,f.user_id)
  and spotted_private.location_audience(p_user,f.user_id,coalesce(fp.location_sharing_level,'all_friends'))
  and not exists(select 1 from public.night_statuses ns where ns.user_id=f.user_id and ns.status='off')
 order by f.user_id,greatest(mine.s,f.started_at);

 return rid;
end $$;

create or replace function spotted_private.build_night_recaps(p_now timestamptz default now())
returns int language plpgsql security definer set search_path='' as $$
declare u record; n int:=0;
begin
 for u in
  select p.id,w.s,w.e,(w.s at time zone spotted_private.city_tz(p.city))::date night
  from public.profiles p
  cross join lateral (select public.night_start_at(p.city,p_now) e) e0
  cross join lateral (select public.night_start_at(p.city,e0.e-interval '1 second') s,e0.e e) w
  where not coalesce(p.is_demo,false)
   and not exists(select 1 from public.night_recaps r where r.user_id=p.id
    and r.night_date=(w.s at time zone spotted_private.city_tz(p.city))::date and not r.is_preview)
   and (exists(select 1 from public.checkins k where k.user_id=p.id and k.verified and k.started_at>=w.s and k.started_at<w.e)
    or exists(select 1 from public.posts q where q.user_id=p.id and q.created_at>=w.s and q.created_at<w.e
     and ((coalesce(q.media_type,'image')='image' and q.image_url is not null)
      or (q.media_type='video' and q.mux_playback_id is not null))))
 loop
  if spotted_private.build_night_recap(u.id,u.s,u.e,u.night) is not null then n:=n+1;end if;
 end loop;
 return n;
end $$;

-- ── 5. The app reads the kind and the playback id ─────────────────────────
create or replace function public.get_night_recap()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); r public.night_recaps;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 select * into r from public.night_recaps where user_id=me and expires_at>now() order by night_date desc limit 1;
 if r.id is null then return null;end if;
 return jsonb_build_object(
  'id',r.id,'night_date',r.night_date,'expires_at',r.expires_at,
  'stops',coalesce((select jsonb_agg(jsonb_build_object('venue_id',s.venue_id,'venue_name',s.venue_name,
    'neighborhood',s.neighborhood,'arrived_at',s.arrived_at,'left_at',s.left_at) order by s.position)
   from public.night_recap_stops s where s.recap_id=r.id),'[]'::jsonb),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'storage_key',p.storage_key,
    'mux_playback_id',p.mux_playback_id,'kind',case when p.mux_playback_id is null then 'photo' else 'video' end,
    'width',p.width,'height',p.height,'thumbhash',p.thumbhash,'source',p.source) order by p.taken_at)
   from public.night_recap_photos p where p.recap_id=r.id),'[]'::jsonb),
  -- Read-time check: someone unfriended or blocked since the reset drops out.
  'people',coalesce((select jsonb_agg(jsonb_build_object('friend_id',x.friend_id,'display_name',pr.display_name,
    'avatar_url',pr.avatar_url,'venue_id',x.venue_id,'venue_name',x.venue_name) order by x.overlap_start)
   from public.night_recap_people x join public.profiles pr on pr.id=x.friend_id
   where x.recap_id=r.id and spotted_private.direct_friend(me,x.friend_id)),'[]'::jsonb));
end $$;

revoke all on function spotted_private.queue_recap_photo_delete(),spotted_private.queue_abandoned_mux_upload(),
 spotted_private.build_night_recap(uuid,timestamptz,timestamptz,date,boolean),
 spotted_private.build_night_recaps(timestamptz) from public,anon,authenticated;
-- No blanket revoke here, so the storage_key grant (CLAUDE.md) is untouched.
commit;
