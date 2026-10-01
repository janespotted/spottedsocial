-- V1 authorization repair. Review and rehearse against a production-shaped copy.
-- Does not infer whether old accepted friendships were legitimately consented to.
begin;

-- Fail safely for review if existing duplicate pairs need consolidation. Never
-- choose/delete someone's relationship history during an automatic deployment.
create unique index v1_friendship_pair on public.friendships(least(user_id,friend_id),greatest(user_id,friend_id));

create or replace function spotted_private.blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blocked_users where
 (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a))
$$;
create or replace function spotted_private.direct_friend(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select a is not null and b is not null and not spotted_private.blocked(a,b)
 and exists(select 1 from public.friendships where status='accepted'
 and ((user_id=a and friend_id=b) or (user_id=b and friend_id=a)))
$$;
create or replace function spotted_private.audience_allows(viewer uuid,owner_id uuid,audience text) returns boolean
language sql stable security definer set search_path='' as $$
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
$$;

create function public.friendship_available(p_other uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and p_other is not null and auth.uid()<>p_other
 and not spotted_private.blocked(auth.uid(),p_other)
$$;

-- Restrict endpoint transitions, including UPDATE of the endpoints themselves.
-- Invoker security is intentional: only trusted definer RPCs/service writes may
-- restore previously accepted consent. An authenticated caller cannot opt out.
create function public.guard_friendship_consent() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
   if auth.uid() is null then raise exception 'Authentication required'; end if;
   if tg_op='INSERT' then
     if new.user_id is distinct from auth.uid() or new.friend_id is null or new.status is distinct from 'pending' or new.user_id=new.friend_id then
       raise exception 'Only a pending request from yourself is allowed';
     end if;
   else
     if new.id<>old.id or new.user_id<>old.user_id or new.friend_id<>old.friend_id
       or new.created_at is distinct from old.created_at
       or old.status is distinct from 'pending' or new.status is distinct from 'accepted' or old.friend_id is distinct from auth.uid() then
       raise exception 'Only the recipient may accept an unchanged pending request';
     end if;
   end if;
   if not public.friendship_available(case when new.user_id=auth.uid() then new.friend_id else new.user_id end) then raise exception 'Relationship unavailable';end if;
 end if;
 return new;
end $$;
create trigger v1_friendship_consent before insert or update on public.friendships
 for each row execute function public.guard_friendship_consent();

create function spotted_private.cleanup_relationship() returns trigger
language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid;
begin
 if tg_table_name='blocked_users' then a:=new.blocker_id;b:=new.blocked_id;
 else a:=old.user_id;b:=old.friend_id; end if;
 delete from public.close_friends where (user_id=a and close_friend_id=b) or (user_id=b and close_friend_id=a);
 if tg_table_name='blocked_users' then
   delete from public.friendships where (user_id=a and friend_id=b) or (user_id=b and friend_id=a);
   delete from spotted_private.friendship_undo where least(sender,recipient)=least(a,b) and greatest(sender,recipient)=greatest(a,b);
 end if;
 return null;
end $$;
create table spotted_private.friendship_undo(
 token uuid primary key default gen_random_uuid(), actor uuid not null,
 sender uuid not null, recipient uuid not null, was_close boolean not null,
 expires_at timestamptz not null default now()+interval '30 seconds'
);
alter table spotted_private.friendship_undo enable row level security;
revoke all on spotted_private.friendship_undo from public,anon,authenticated;
create trigger v1_friendship_cleanup after delete on public.friendships
 for each row execute function spotted_private.cleanup_relationship();
create trigger v1_block_cleanup after insert on public.blocked_users
 for each row execute function spotted_private.cleanup_relationship();

-- Serialize all pair mutations, including legacy direct writes. Existing duplicate
-- pairs must be reviewed before deploying a unique index; do not delete history.
create function public.lock_friendship_pair() returns trigger
language plpgsql set search_path='' as $$
declare a uuid; b uuid;
begin
 if tg_op='DELETE' then a:=old.user_id;b:=old.friend_id;else a:=new.user_id;b:=new.friend_id;end if;
 perform pg_advisory_xact_lock(hashtextextended(least(a,b)::text||greatest(a,b)::text,41));
 if tg_op='INSERT' and exists(select 1 from public.friendships where
 (user_id=a and friend_id=b) or (user_id=b and friend_id=a)) then raise exception 'Relationship already exists';end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger v1_00_pair_lock before insert or update or delete on public.friendships
 for each row execute function public.lock_friendship_pair();

create function public.lock_block_pair() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(least(new.blocker_id,new.blocked_id)::text||greatest(new.blocker_id,new.blocked_id)::text,41));
 return new;
end $$;
create trigger v1_00_block_pair_lock before insert on public.blocked_users for each row execute function public.lock_block_pair();

create function public.remove_friendship(p_other uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); f public.friendships; result uuid; close_before boolean;
begin
 if me is null or me=p_other then raise exception 'Invalid caller';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(me,p_other)::text||greatest(me,p_other)::text,41));
 select * into f from public.friendships where status='accepted' and
 ((user_id=me and friend_id=p_other) or (user_id=p_other and friend_id=me)) order by created_at,id limit 1;
 close_before:=exists(select 1 from public.close_friends where user_id=me and close_friend_id=p_other);
 delete from spotted_private.friendship_undo where expires_at<=now() or
 (least(sender,recipient)=least(me,p_other) and greatest(sender,recipient)=greatest(me,p_other));
 delete from public.friendships where (user_id=me and friend_id=p_other) or (user_id=p_other and friend_id=me);
 delete from public.close_friends where (user_id=me and close_friend_id=p_other) or (user_id=p_other and close_friend_id=me);
 if f.id is not null and not spotted_private.blocked(me,p_other) then
   insert into spotted_private.friendship_undo(actor,sender,recipient,was_close)
     values(me,f.user_id,f.friend_id,close_before) returning token into result;
 end if;
 return result;
end $$;
create function public.restore_friendship(p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r spotted_private.friendship_undo;
begin
 select * into r from spotted_private.friendship_undo where token=p_token and actor=auth.uid() and expires_at>now();
 if not found then raise exception 'Undo expired or unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(r.sender,r.recipient)::text||greatest(r.sender,r.recipient)::text,41));
 select * into r from spotted_private.friendship_undo where token=p_token and actor=auth.uid() and expires_at>now() for update;
 if not found then raise exception 'Undo expired or unavailable';end if;
 if spotted_private.blocked(r.sender,r.recipient) then raise exception 'Relationship unavailable';end if;
 delete from spotted_private.friendship_undo where token=p_token;
 insert into public.friendships(user_id,friend_id,status) values(r.sender,r.recipient,'accepted');
 if r.was_close then insert into public.close_friends(user_id,close_friend_id)
   values(r.actor,case when r.actor=r.sender then r.recipient else r.sender end) on conflict do nothing;end if;
end $$;

-- An owner-issued invite code is an explicit invitation. Preserve redemption,
-- but create one canonical pair (the legacy RPC inserted both directions), lock
-- code capacity and bind redemption to the authenticated recipient.
create or replace function public.process_invite_code(invite_code text,new_user_id uuid) returns json
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); invitation public.invite_codes; inviter public.profiles; f public.friendships;
begin
 if me is null or me is distinct from new_user_id then return json_build_object('success',false,'error','Unauthorized');end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,44));
 select * into invitation from public.invite_codes where code=invite_code
 and (expires_at is null or expires_at>now()) and (max_uses is null or coalesce(uses_count,0)<max_uses) for update;
 if not found or invitation.user_id=me then return json_build_object('success',false,'error','Invalid or expired invite code');end if;
 if exists(select 1 from public.invite_uses where invited_user_id=me) then return json_build_object('success',false,'error','User already used an invite');end if;
 perform pg_advisory_xact_lock(hashtextextended(least(me,invitation.user_id)::text||greatest(me,invitation.user_id)::text,41));
 if spotted_private.blocked(me,invitation.user_id) then return json_build_object('success',false,'error','Cannot create friendship');end if;
 select * into inviter from public.profiles where id=invitation.user_id;
 if not found or not exists(select 1 from public.profiles where id=me) then return json_build_object('success',false,'error','Unavailable account');end if;
 select * into f from public.friendships where least(user_id,friend_id)=least(me,invitation.user_id)
 and greatest(user_id,friend_id)=greatest(me,invitation.user_id);
 if not found then insert into public.friendships(user_id,friend_id,status) values(invitation.user_id,me,'accepted');
 elsif f.status='pending' then update public.friendships set status='accepted' where id=f.id;
 elsif f.status<>'accepted' then return json_build_object('success',false,'error','Cannot create friendship');end if;
 insert into public.invite_uses(invite_code_id,inviter_id,invited_user_id) values(invitation.id,invitation.user_id,me);
 update public.invite_codes set uses_count=coalesce(uses_count,0)+1 where id=invitation.id;
 return json_build_object('success',true,'inviter_id',inviter.id,'inviter_name',inviter.display_name,'inviter_avatar',inviter.avatar_url);
end $$;
revoke all on function public.process_invite_code(text,uuid) from public,anon;
grant execute on function public.process_invite_code(text,uuid) to authenticated;

create policy v1_close_membership on public.close_friends as restrictive for insert to authenticated
 with check(user_id=auth.uid() and public.is_direct_friend(auth.uid(),close_friend_id));

create or replace function public.is_direct_friend(viewer_id uuid,target_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()=viewer_id and spotted_private.direct_friend(viewer_id,target_user_id)
$$;
create or replace function public.is_close_friend(viewer_id uuid,target_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()=viewer_id and spotted_private.audience_allows(viewer_id,target_user_id,'close_friends')
$$;
create or replace function public.is_friend_or_mutual(viewer_id uuid,target_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()=viewer_id and spotted_private.audience_allows(viewer_id,target_user_id,'mutual_friends')
$$;
create function spotted_private.location_audience(viewer uuid,owner_id uuid,audience text) returns boolean
language sql stable security definer set search_path='' as $$
 select spotted_private.audience_allows(viewer,owner_id,audience) and not exists(
 select 1 from public.location_hidden where user_id=owner_id and hidden_from_id=viewer)
$$;
create or replace function public._can_see_location_unchecked(viewer_id uuid,target_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.night_statuses s join public.profiles p on p.id=s.user_id
 where s.user_id=target_user_id and s.status='out' and s.expires_at>now()
 and spotted_private.location_audience(viewer_id,target_user_id,p.location_sharing_level))
$$;
create or replace function public.can_see_location(viewer_id uuid,target_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()=viewer_id and public._can_see_location_unchecked(viewer_id,target_user_id)
$$;
create or replace function public.can_see_planning(viewer_id uuid,target_user_id uuid,visibility text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.uid()=viewer_id and exists(select 1 from public.night_statuses s
 where s.user_id=target_user_id and s.status='planning' and s.expires_at>now()
 and spotted_private.location_audience(viewer_id,target_user_id,coalesce(s.planning_visibility,(select location_sharing_level from public.profiles where id=s.user_id),'all_friends')))
$$;
create or replace function spotted_private.social_visible(viewer uuid,owner_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles v,public.profiles p join public.night_statuses s on s.user_id=p.id
 where v.id=viewer and p.id=owner_id and not coalesce(v.is_demo,false) and not coalesce(p.is_demo,false)
 and s.status in ('out','planning') and s.expires_at>now()
 and spotted_private.location_audience(viewer,owner_id,case when s.status='planning' then coalesce(s.planning_visibility,p.location_sharing_level) else p.location_sharing_level end))
$$;
create function public.can_read_post(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.posts p join public.profiles author on author.id=p.user_id
 where p.id=p_id and (p.expires_at is null or p.expires_at>now()) and not spotted_private.blocked(auth.uid(),p.user_id)
 and (spotted_private.audience_allows(auth.uid(),p.user_id,p.visibility) or author.is_demo is true))
$$;
create or replace function spotted_private.post_visible(viewer uuid,post_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.posts p join public.profiles author on author.id=p.user_id where p.id=post_id and (p.expires_at is null or p.expires_at>now())
 and spotted_private.audience_allows(viewer,p.user_id,p.visibility))
$$;

-- Remove additive SELECT policies: permissive policies combine with OR.
do $$ declare p record;begin
 for p in select * from pg_policies where schemaname='public' and tablename in ('posts','night_statuses','checkins','party_locations') and cmd in ('SELECT','ALL') loop
   execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
create policy v1_posts_read on public.posts for select to authenticated using((user_id=auth.uid() and expires_at>now()) or public.can_read_post(id));
create policy v1_status_read on public.night_statuses for select to authenticated using(
 user_id=auth.uid() or (expires_at>now() and case when status='planning' then public.can_see_planning(auth.uid(),user_id,planning_visibility)
 else public.can_see_location(auth.uid(),user_id) end));
create policy v1_status_insert on public.night_statuses for insert to authenticated with check(user_id=auth.uid());
create policy v1_status_update on public.night_statuses for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy v1_status_delete on public.night_statuses for delete to authenticated using(user_id=auth.uid());
create policy v1_checkins_read on public.checkins for select to authenticated using(
 user_id=auth.uid() or (public.can_see_location(auth.uid(),user_id) and started_at>now()-interval '30 days'));
create policy v1_party_pin_read on public.party_locations for select to authenticated using(user_id=auth.uid() or
 (expires_at>now() and public.can_see_location(auth.uid(),user_id) and public.is_close_friend(auth.uid(),user_id) and exists(
 select 1 from public.night_statuses where user_id=party_locations.user_id and is_private_party is true and status='out' and expires_at>now())));
create policy v1_like_parent_read on public.post_likes as restrictive for select to public using(public.can_read_post(post_id));
create policy v1_comment_parent_read on public.post_comments as restrictive for select to public using(public.can_read_post(post_id));
create policy v1_comment_like_parent_read on public.post_comment_likes as restrictive for select to public using(exists(
 select 1 from public.post_comments c where c.id=comment_id and public.can_read_post(c.post_id)));
create policy v1_tag_parent_read on public.post_tags as restrictive for select to public using(public.can_read_post(post_id));

-- Raw coordinates and addresses cannot be SELECTed, even via row-to-JSON/star.
-- Writes remain subject to ownership RLS. Own coordinates use a caller-bound RPC.
do $$ declare t text; cols text;begin
 foreach t in array array['night_statuses','checkins'] loop
   execute format('revoke select on public.%I from public,anon,authenticated',t);
   select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
     where table_schema='public' and table_name=t;
   execute format('revoke select (%s) on public.%I from public,anon,authenticated',cols,t);
   select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
     where table_schema='public' and table_name=t and column_name not in ('lat','lng','party_address');
   execute format('grant select (%s) on public.%I to authenticated',cols,t);
 end loop;
end $$;
-- INSERT ... ON CONFLICT reads EXCLUDED coordinate columns, which now lack
-- client SELECT grants. Preserve native check-ins through this caller-bound,
-- whitelisted mutation instead of reopening raw coordinate/address reads.
create function public.upsert_own_night_status(p_patch jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); s public.night_statuses;
begin
 if me is null or jsonb_typeof(p_patch) is distinct from 'object' or p_patch->>'user_id' is distinct from me::text
 or not exists(select 1 from public.profiles where id=me) then raise exception 'Invalid status owner';end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where k not in
 ('user_id','status','venue_id','venue_name','lat','lng','updated_at','expires_at','automatic_venue_updates',
 'planning_neighborhood','planning_venue_id','planning_venue_name','planning_visibility','is_private_party','party_neighborhood','party_address')) then
 raise exception 'Unsupported status field';end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,43));
 select * into s from public.night_statuses where user_id=me for update;
 if not found then insert into public.night_statuses(user_id,status) values(me,'home') returning * into s;end if;
 s:=jsonb_populate_record(s,p_patch);
 update public.night_statuses set status=s.status,venue_id=s.venue_id,venue_name=s.venue_name,
 lat=s.lat,lng=s.lng,updated_at=s.updated_at,expires_at=s.expires_at,automatic_venue_updates=s.automatic_venue_updates,
 planning_neighborhood=s.planning_neighborhood,planning_venue_id=s.planning_venue_id,planning_venue_name=s.planning_venue_name,
 planning_visibility=s.planning_visibility,is_private_party=s.is_private_party,party_neighborhood=s.party_neighborhood,party_address=s.party_address
 where user_id=me;
end $$;
revoke all on function public.upsert_own_night_status(jsonb) from public,anon;
grant execute on function public.upsert_own_night_status(jsonb) to authenticated;

create function public.get_own_night_status() returns setof public.night_statuses
language sql stable security definer set search_path='' as $$
 select * from public.night_statuses where user_id=auth.uid() and expires_at>now()
$$;
create or replace function public.get_party_address(p_status_user_id uuid) returns text
language sql stable security definer set search_path='' as $$ select public.approved_party_address(p_status_user_id) $$;

create or replace function public.get_profiles_safe()
returns table(id uuid,display_name text,username text,avatar_url text,bio text,created_at timestamptz,is_demo boolean,
 location_sharing_level text,last_known_lat double precision,last_known_lng double precision,is_out boolean,last_location_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.username,p.avatar_url,p.bio,p.created_at,p.is_demo,p.location_sharing_level,
 case when allowed.gps then p.last_known_lat end,case when allowed.gps then p.last_known_lng end,
 coalesce(public._can_see_location_unchecked(auth.uid(),p.id),false),case when allowed.gps then p.last_location_at end
 from public.profiles p cross join lateral (select
   auth.uid() is not null and public._can_see_location_unchecked(auth.uid(),p.id)
   and p.is_out is true and p.last_location_at>=public.night_start_at(p.city)
   and p.last_location_at<=now()+interval '30 seconds'
   and exists(select 1 from public.night_statuses s where s.user_id=p.id and not coalesce(s.is_private_party,false)) as gps) allowed
 where auth.uid() is not null
$$;

-- The demo map previously selected raw coordinates for every status. Expose
-- only trusted seed identities here; real users always use get_profiles_safe.
create function public.get_demo_status_locations() returns table(user_id uuid,lat double precision,lng double precision)
language sql stable security definer set search_path='' as $$
 select s.user_id,s.lat,s.lng from public.night_statuses s join public.profiles p on p.id=s.user_id
 where auth.uid() is not null and p.is_demo is true and s.status='out' and s.expires_at>now()
 and not coalesce(s.is_private_party,false) and spotted_private.location_audience(auth.uid(),s.user_id,p.location_sharing_level)
$$;
revoke all on function public.get_demo_status_locations() from public,anon;
grant execute on function public.get_demo_status_locations() to authenticated;

-- A restarted party without a fresh coordinate must not inherit an old pin.
create or replace function public.night_status_party_location_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.is_private_party,false) then
  if new.lat is not null and new.lng is not null and new.expires_at is not null then
   insert into public.party_locations(user_id,lat,lng,expires_at,updated_at)
   values(new.user_id,new.lat,new.lng,new.expires_at,now()) on conflict(user_id) do update
   set lat=excluded.lat,lng=excluded.lng,expires_at=excluded.expires_at,updated_at=now();
  elsif tg_op='INSERT' or new.updated_at is distinct from old.updated_at or new.expires_at is distinct from old.expires_at then
   delete from public.party_locations where user_id=new.user_id;
  end if;
  new.lat:=null;new.lng:=null;
 else delete from public.party_locations where user_id=new.user_id;
 end if;
 return new;
end $$;

-- Clear sharing atomically with state transition, even if the client's next
-- network request fails. Read predicates still enforce expiry independently.
create function spotted_private.revoke_inactive_location() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'out' or new.expires_at<=now() or coalesce(new.is_private_party,false)
 or (tg_op='UPDATE' and (old.status<>'out' or old.expires_at<>new.expires_at)) then
   update public.profiles set is_out=false,last_known_lat=null,last_known_lng=null,last_location_at=null where id=new.user_id;
   if new.status<>'out' or new.expires_at<=now() then
     update public.checkins set ended_at=coalesce(ended_at,now()) where user_id=new.user_id and ended_at is null;
     delete from public.party_locations where user_id=new.user_id;
   end if;
 end if;
 return null;
end $$;
create trigger v1_location_transition after insert or update on public.night_statuses
 for each row execute function spotted_private.revoke_inactive_location();
create function public.guard_demo_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and ((tg_op='INSERT' and coalesce(new.is_demo,false)) or
 (tg_op='UPDATE' and new.is_demo is distinct from old.is_demo)) then raise exception 'Demo identity is service managed';end if;
 return new;
end $$;
create trigger v1_demo_identity before insert or update on public.profiles for each row execute function public.guard_demo_identity();

create or replace function public.user_is_thread_member(thread_uuid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.dm_thread_members where thread_id=thread_uuid and user_id=auth.uid())
$$;
-- The registry's unique pair also protects higher transaction isolation levels:
-- a stale transaction fails rather than creating a second canonical thread.
create table spotted_private.direct_thread_pairs(
 low_user uuid not null,high_user uuid not null,thread_id uuid not null unique references public.dm_threads(id) on delete cascade,
 primary key(low_user,high_user),check(low_user<high_user)
);
alter table spotted_private.direct_thread_pairs enable row level security;
revoke all on spotted_private.direct_thread_pairs from public,anon,authenticated;

create or replace function public.create_dm_thread(friend_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); result uuid;
begin
 if me is null or friend_id is null or me=friend_id or spotted_private.blocked(me,friend_id) then raise exception 'Direct chat unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended(least(me,friend_id)::text||greatest(me,friend_id)::text,42));
 select t.id into result from public.dm_threads t where not coalesce(t.is_group,false)
   and (select count(*) from public.dm_thread_members m where m.thread_id=t.id)=2
   and exists(select 1 from public.dm_thread_members where thread_id=t.id and user_id=me)
   and exists(select 1 from public.dm_thread_members where thread_id=t.id and user_id=friend_id)
   order by (exists(select 1 from spotted_private.direct_thread_pairs d where d.thread_id=t.id)) desc,t.id limit 1;
 if result is null then
   insert into public.dm_threads(created_by,is_group) values(me,false) returning id into result;
   insert into public.dm_thread_members(thread_id,user_id) values(result,me),(result,friend_id);
 end if;
 insert into spotted_private.direct_thread_pairs(low_user,high_user,thread_id)
 values(least(me,friend_id),greatest(me,friend_id),result) on conflict(low_user,high_user)
 do update set thread_id=excluded.thread_id;
 return result;
end $$;

-- The existing location RPC binds every mutation to auth.uid(), validates state
-- and revision under a row lock, and has an empty search_path. It now needs owner
-- privileges to read protected columns; clients no longer receive those grants.
alter function public.record_live_location(double precision,double precision,double precision,timestamptz,timestamptz,double precision) security definer;

-- No externally callable unchecked helpers. Internal notification/cron code
-- executes as its definer; public adapters bind the viewer to auth.uid().
revoke all on function public._can_see_location_unchecked(uuid,uuid) from public,anon,authenticated;
revoke all on all functions in schema spotted_private from public,anon,authenticated;
revoke all on function public.remove_friendship(uuid),public.restore_friendship(uuid),public.can_read_post(uuid),public.get_own_night_status() from public,anon;
grant execute on function public.remove_friendship(uuid),public.restore_friendship(uuid),public.can_read_post(uuid),public.get_own_night_status() to authenticated;
revoke all on function public.guard_friendship_consent(),public.lock_friendship_pair(),public.guard_demo_identity(),public.lock_block_pair() from public,anon,authenticated;
revoke all on function public.friendship_available(uuid) from public,anon;
grant execute on function public.friendship_available(uuid) to authenticated;
commit;
