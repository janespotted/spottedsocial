-- Morning After recaps (client brief §3/§7; mobile/DAY-NIGHT-MODE-PLAN.md §2).
-- The 5 AM reset builds each user's PRIVATE recap of the night BEFORE it
-- deletes anything: their GPS-verified stops, their own photos and the
-- friends whose shared check-ins overlapped. Only the owner can read it, only
-- through get_night_recap(); it expires at the next reset. Expired posts and
-- locations stay deleted — the recap copies what the day view needs, and the
-- photo FILES are kept (and served to the owner only) until it expires.
begin;

-- ── 1. Check-ins the server can vouch for ────────────────────────────────
-- Old table policies still let a client insert or edit its own check-ins
-- (the web build does). A forged stop could be used to learn where friends
-- were, so recaps read only rows written server-side (commit_night_status /
-- record_live_location run as the owner on a valid GPS fix). Client writes
-- keep working for the web build but are never verified, can't move a
-- check-in's venue or start, and can only end it earlier.
alter table public.checkins add column if not exists verified boolean not null default false;

create or replace function spotted_private.guard_checkin_provenance()
returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if tg_op='INSERT' then new.verified:=false; return new; end if;
  new.verified:=old.verified; new.user_id:=old.user_id; new.venue_id:=old.venue_id;
  new.venue_name:=old.venue_name; new.started_at:=old.started_at;
  if new.ended_at is distinct from old.ended_at then
   if new.ended_at is null then new.ended_at:=old.ended_at;
   else new.ended_at:=greatest(least(new.ended_at,coalesce(old.ended_at,now()),now()),old.started_at);
   end if;
  end if;
  if new.last_updated_at is distinct from old.last_updated_at then
   new.last_updated_at:=least(new.last_updated_at,now());
  end if;
 elsif tg_op='INSERT' then
  new.verified:=true;
 end if;
 return new;
end $$;
create trigger guard_checkin_provenance before insert or update on public.checkins
 for each row execute function spotted_private.guard_checkin_provenance();

-- ── 2. The recap tables (owner-only, read through the RPC) ────────────────
create table public.night_recaps(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 city text,
 night_date date not null,
 is_preview boolean not null default false,   -- build_my_recap_now (testers)
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 unique(user_id,night_date)
);
create index night_recaps_expiry on public.night_recaps(expires_at);

create table public.night_recap_stops(
 recap_id uuid not null references public.night_recaps(id) on delete cascade,
 position int not null,
 venue_id uuid references public.venues(id) on delete set null,
 venue_name text not null,
 neighborhood text,
 arrived_at timestamptz not null,
 left_at timestamptz,                          -- only when really recorded
 primary key(recap_id,position)
);

create table public.night_recap_photos(
 id uuid primary key default gen_random_uuid(),
 recap_id uuid not null references public.night_recaps(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 storage_key text not null,
 width int, height int, thumbhash text,
 taken_at timestamptz not null default now(),
 source text not null check(source in ('post','library')),
 unique(recap_id,storage_key)
);
create index night_recap_photos_key on public.night_recap_photos(storage_key);

create table public.night_recap_people(
 recap_id uuid not null references public.night_recaps(id) on delete cascade,
 friend_id uuid not null references public.profiles(id) on delete cascade,
 venue_id uuid references public.venues(id) on delete set null,
 venue_name text not null,
 overlap_start timestamptz not null,
 overlap_end timestamptz not null,
 primary key(recap_id,friend_id)
);

alter table public.night_recaps enable row level security;
alter table public.night_recap_stops enable row level security;
alter table public.night_recap_photos enable row level security;
alter table public.night_recap_people enable row level security;
revoke all on public.night_recaps,public.night_recap_stops,public.night_recap_photos,public.night_recap_people
 from public,anon,authenticated;

-- A recap photo's file goes through the normal deletion queue when the
-- recap expires (the worker re-checks media_referenced before deleting).
create or replace function spotted_private.queue_recap_photo_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.media_object_deletions(bucket_id,name) values('post-images',old.storage_key) on conflict do nothing;
 return old;
end $$;
create trigger queue_recap_photo_delete after delete on public.night_recap_photos
 for each row execute function spotted_private.queue_recap_photo_delete();

-- Keep the files a recap points at (the post row is deleted at the reset).
create or replace function spotted_private.media_referenced(key text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.posts p join public.profiles u on u.id=p.user_id where spotted_private.storage_key(p.image_url)=key)
 or exists(select 1 from public.dm_messages m join public.profiles u on u.id=m.sender_id where spotted_private.storage_key(m.image_url)=key)
 or exists(select 1 from public.dm_threads t where spotted_private.storage_key(t.group_avatar_url)=key
 and exists(select 1 from public.dm_thread_members where thread_id=t.id))
 or exists(select 1 from public.night_recap_photos r where r.storage_key=key)
$$;

-- Serve a recap photo to its owner only, while the recap lasts.
create or replace function public.private_media_target(p_path text default null,p_playback_id text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
   and spotted_private.storage_key(t.group_avatar_url)=key and split_part(key,'/',1)='group-avatars' and split_part(key,'/',2)=t.id::text and public.user_is_thread_member(t.id))
 or exists(select 1 from public.night_recap_photos r join public.night_recaps n on n.id=r.recap_id
   where r.storage_key=key and r.user_id=me and n.user_id=me and split_part(key,'/',1)=me::text and n.expires_at>now()) then
   return jsonb_build_object('bucket','post-images','path',key);
 end if;
 return null;
end $$;

-- ── 3. Building one recap ─────────────────────────────────────────────────
create or replace function spotted_private.city_tz(p_city text)
returns text language sql immutable set search_path='' as $$
 select case p_city when 'la' then 'America/Los_Angeles' when 'lhr' then 'Asia/Karachi' else 'America/New_York' end
$$;

-- One user's night [p_start, p_end). Returns the recap id, or null when the
-- night had no verified stop and no photo (no recap; the app says so).
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
   and coalesce(p.media_type,'image')='image' and spotted_private.storage_key(p.image_url) is not null) then
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

 -- Photos: the user's own photo posts from the night (copies the key; the
 -- post itself is still deleted by the reset).
 insert into public.night_recap_photos(recap_id,user_id,storage_key,width,height,thumbhash,taken_at,source)
 select rid,p_user,x.k,p.media_width,p.media_height,p.media_hash,p.created_at,'post'
 from public.posts p cross join lateral (select spotted_private.storage_key(p.image_url) k) x
 where p.user_id=p_user and p.created_at>=p_start and p.created_at<p_end and coalesce(p.media_type,'image')='image'
  and x.k is not null and split_part(x.k,'/',1)=p_user::text
 order by p.created_at limit 9
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

-- Every user whose city night has ended: the night is the 5 AM-to-5 AM
-- window before the most recent 5 AM in their city. Idempotent (one recap
-- per user and night), so the five daily reset runs can't double up.
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
     and coalesce(q.media_type,'image')='image' and q.image_url is not null))
 loop
  if spotted_private.build_night_recap(u.id,u.s,u.e,u.night) is not null then n:=n+1;end if;
 end loop;
 return n;
end $$;

-- ── 4. The reset builds recaps first and expires old ones last ────────────
create or replace function public.nightly_reset()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_now timestamptz := now();
  v_conservative timestamptz := least(night_start_at('nyc', now()), night_start_at('la', now()));
  n int;
  result jsonb := '{}'::jsonb;
begin
  -- Morning After: snapshot each finished night BEFORE anything below
  -- closes check-ins, clears statuses or deletes posts. Its own savepoint,
  -- so a recap problem can never stop the reset.
  begin
    n := spotted_private.build_night_recaps(v_now);
    result := result || jsonb_build_object('built_recaps', n);
  exception when others then
    result := result || jsonb_build_object('recap_error', sqlerrm);
  end;

  update profiles p
     set is_out = false,
         last_known_lat = null,
         last_known_lng = null,
         last_location_at = null
   where p.is_out = true
     and (
       not exists (
         select 1 from night_statuses s
          where s.user_id = p.id and s.status = 'out' and s.expires_at > v_now
       )
       or p.last_location_at < night_start_at(p.city, v_now)
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_locations', n);

  update checkins c
     set ended_at = v_now
   where c.ended_at is null
     and not exists (
       select 1 from night_statuses s
        where s.user_id = c.user_id and s.status = 'out' and s.expires_at > v_now
     );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('ended_checkins', n);

  delete from dm_messages m
   where m.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = m.sender_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_dms', n);

  delete from invites where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_invites', n);

  update night_statuses
     set status = 'home',
         venue_name = null,
         venue_id = null,
         lat = null,
         lng = null,
         expires_at = null,
         is_private_party = false,
         party_neighborhood = null,
         party_address = null,
         planning_neighborhood = null,
         planning_venue_id = null,
         planning_venue_name = null,
         planning_visibility = null
   where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_statuses', n);

  -- Belt and braces: the trigger above already drops a party spot when its
  -- status resets, but an orphaned row must never outlive its night.
  delete from party_locations where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('cleared_party_locations', n);

  delete from posts where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_posts', n);

  delete from yap_messages where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_yaps', n);

  delete from plans where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_plans', n);

  delete from notifications x
   where x.created_at < coalesce(
     (select night_start_at(p.city, v_now) from profiles p where p.id = x.receiver_id),
     v_conservative
   );
  get diagnostics n = row_count;
  result := result || jsonb_build_object('deleted_notifications', n);

  -- Yesterday's recaps; their photo files go through the deletion queue.
  delete from night_recaps where expires_at < v_now;
  get diagnostics n = row_count;
  result := result || jsonb_build_object('expired_recaps', n);

  raise notice '[nightly_reset] %', result;
  return result;
end;
$function$;

-- ── 5. What the app calls ─────────────────────────────────────────────────
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
  'photos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'storage_key',p.storage_key,'width',p.width,
    'height',p.height,'thumbhash',p.thumbhash,'source',p.source) order by p.taken_at)
   from public.night_recap_photos p where p.recap_id=r.id),'[]'::jsonb),
  -- Read-time check: someone unfriended or blocked since the reset drops out.
  'people',coalesce((select jsonb_agg(jsonb_build_object('friend_id',x.friend_id,'display_name',pr.display_name,
    'avatar_url',pr.avatar_url,'venue_id',x.venue_id,'venue_name',x.venue_name) order by x.overlap_start)
   from public.night_recap_people x join public.profiles pr on pr.id=x.friend_id
   where x.recap_id=r.id and spotted_private.direct_friend(me,x.friend_id)),'[]'::jsonb));
end $$;

-- A photo the user explicitly picked from their library, uploaded under
-- <uid>/recap-v1/ (allowed by can_upload_v1_media). Owner, unexpired, ≤ 9.
create or replace function public.add_recap_photo(p_recap uuid,p_key text,p_width int default null,
 p_height int default null,p_thumbhash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); pid uuid;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if not exists(select 1 from public.night_recaps where id=p_recap and user_id=me and expires_at>now()) then
  raise exception 'Recap unavailable' using errcode='42501';end if;
 if p_key is null or spotted_private.storage_key(p_key) is distinct from p_key or p_key not like me::text||'/recap-v1/%' then
  raise exception 'Invalid photo';end if;
 if not exists(select 1 from storage.objects where bucket_id='post-images' and name=p_key and owner_id=me::text) then
  raise exception 'Photo not uploaded';end if;
 if (select count(*) from public.night_recap_photos where recap_id=p_recap)>=9 then raise exception 'Up to 9 pictures';end if;
 insert into public.night_recap_photos(recap_id,user_id,storage_key,width,height,thumbhash,source)
 values(p_recap,me,p_key,p_width,p_height,p_thumbhash,'library') on conflict do nothing returning id into pid;
 return jsonb_build_object('id',pid,'storage_key',p_key);
end $$;

-- Testers only: build a preview from tonight so far instead of waiting for
-- 5 AM. The real recap replaces it at the reset.
create or replace function public.build_my_recap_now()
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); c text; s timestamptz;
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if not exists(select 1 from spotted_private.night_mode_testers where user_id=me) then
  raise exception 'Not a tester account' using errcode='42501';end if;
 select city into c from public.profiles where id=me;
 s:=public.night_start_at(c,now());
 delete from public.night_recaps where user_id=me and night_date=(s at time zone spotted_private.city_tz(c))::date;
 perform spotted_private.build_night_recap(me,s,now(),(s at time zone spotted_private.city_tz(c))::date,true);
 return public.get_night_recap();
end $$;

revoke all on function public.get_night_recap(),public.add_recap_photo(uuid,text,int,int,text),public.build_my_recap_now()
 from public,anon;
grant execute on function public.get_night_recap(),public.add_recap_photo(uuid,text,int,int,text),public.build_my_recap_now()
 to authenticated;
revoke all on function spotted_private.guard_checkin_provenance(),spotted_private.queue_recap_photo_delete(),
 spotted_private.city_tz(text),spotted_private.build_night_recap(uuid,timestamptz,timestamptz,date,boolean),
 spotted_private.build_night_recaps(timestamptz) from public,anon,authenticated;
-- No blanket revoke here, so the storage_key grant (CLAUDE.md) is untouched.
commit;
