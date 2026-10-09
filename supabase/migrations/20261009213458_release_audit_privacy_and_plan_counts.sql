-- October release audit: validate group membership, recheck recap consent,
-- and maintain plan aggregates without granting participants parent-edit access.
begin;

-- Historical installations have either (or both) argument orders. Keep one
-- named-argument endpoint so PostgREST cannot select an insecure overload.
drop function if exists public.create_group_thread(text,uuid[]);
drop function if exists public.create_group_thread(uuid[],text);
create function public.create_group_thread(member_ids uuid[], group_name text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 me uuid := auth.uid();
 members uuid[];
 thread_id uuid;
 clean_name text := nullif(btrim(group_name),'');
begin
 if me is null or not exists(select 1 from public.profiles where id=me and not coalesce(is_demo,false)) then
  raise exception 'Not authenticated' using errcode='42501';
 end if;
 if member_ids is null or cardinality(member_ids)>64 or array_position(member_ids,null) is not null
    or me=any(member_ids) then
  raise exception 'Choose between 2 and 64 friends' using errcode='22023';
 end if;
 select array_agg(distinct u) into members from unnest(member_ids) u;
 if coalesce(cardinality(members),0)<2 then
  raise exception 'Choose at least two different friends' using errcode='22023';
 end if;
 if char_length(clean_name)>100 then
  raise exception 'Group name must be 100 characters or fewer' using errcode='22023';
 end if;
 if exists(select 1 from unnest(members) u where not exists(
   select 1 from public.profiles p where p.id=u and not coalesce(p.is_demo,false)
    and spotted_private.direct_friend(me,u))) then
  raise exception 'Members must be current friends' using errcode='42501';
 end if;
 -- Check every pair, including invitees who have blocked one another.
 if exists(select 1 from public.blocked_users
   where blocker_id=any(array_append(members,me)) and blocked_id=any(array_append(members,me))) then
  raise exception 'These members cannot share a group' using errcode='42501';
 end if;
 insert into public.dm_threads(created_by,is_group,name) values(me,true,clean_name) returning id into thread_id;
 insert into public.dm_thread_members(thread_id,user_id)
  select thread_id,u from unnest(array_append(members,me)) u;
 return thread_id;
end $$;
revoke all on function public.create_group_thread(uuid[],text) from public,anon,authenticated;
grant execute on function public.create_group_thread(uuid[],text) to authenticated,service_role;

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
  -- Recheck current sharing permission; historic overlap is not perpetual consent.
  'people',coalesce((select jsonb_agg(jsonb_build_object('friend_id',x.friend_id,'display_name',pr.display_name,
    'avatar_url',pr.avatar_url,'venue_id',x.venue_id,'venue_name',x.venue_name) order by x.overlap_start)
   from public.night_recap_people x join public.profiles pr on pr.id=x.friend_id
   where x.recap_id=r.id and spotted_private.direct_friend(me,x.friend_id)
     and spotted_private.location_audience(me,x.friend_id,coalesce(pr.location_sharing_level,'all_friends'))),'[]'::jsonb));
end $$;

-- Location consent also invalidates the previously rendered recap/map.
-- The signal carries no location data and is readable only by its recipient.
alter table public.relationship_events drop constraint if exists relationship_events_kind_check;
alter table public.relationship_events add constraint relationship_events_kind_check
 check(kind in ('unfriended','blocked','close_friend_removed','location_changed'));
create or replace function spotted_private.emit_location_consent_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='location_hidden' then
  insert into public.relationship_events(user_id,other_user_id,kind)
   values(new.hidden_from_id,new.user_id,'location_changed');
 else
  insert into public.relationship_events(user_id,other_user_id,kind)
   select p.id,new.id,'location_changed' from public.profiles p
   where p.id<>new.id
    and spotted_private.location_audience(p.id,new.id,coalesce(old.location_sharing_level,'all_friends'))
    and not spotted_private.location_audience(p.id,new.id,coalesce(new.location_sharing_level,'all_friends'));
 end if;
 return null;
end $$;
revoke all on function spotted_private.emit_location_consent_event() from public,anon,authenticated;
drop trigger if exists release_location_hidden_event on public.location_hidden;
create trigger release_location_hidden_event after insert on public.location_hidden
 for each row execute function spotted_private.emit_location_consent_event();
drop trigger if exists release_location_audience_event on public.profiles;
create trigger release_location_audience_event after update of location_sharing_level on public.profiles
 for each row when (old.location_sharing_level is distinct from new.location_sharing_level)
 execute function spotted_private.emit_location_consent_event();

-- These private trigger functions run only after the child write passes RLS.
-- Participants can vote/comment but must never gain UPDATE access to the plan.
create or replace function spotted_private.update_plan_score() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op in ('DELETE','UPDATE') then
  update public.plans set score=coalesce(score,0)-case when old.vote_type='up' then 1 else -1 end where id=old.plan_id;
 end if;
 if tg_op in ('INSERT','UPDATE') then
  update public.plans set score=coalesce(score,0)+case when new.vote_type='up' then 1 else -1 end where id=new.plan_id;
 end if;
 return null;
end $$;
create or replace function spotted_private.update_plan_comments_count() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  update public.plans set comments_count=coalesce(comments_count,0)+1 where id=new.plan_id;
 elsif tg_op='DELETE' then
  update public.plans set comments_count=greatest(coalesce(comments_count,0)-1,0) where id=old.plan_id;
 end if;
 return null;
end $$;
revoke all on function spotted_private.update_plan_score(),spotted_private.update_plan_comments_count() from public,anon,authenticated;
drop trigger if exists trigger_update_plan_score on public.plan_votes;
create trigger trigger_update_plan_score after insert or update or delete on public.plan_votes
 for each row execute function spotted_private.update_plan_score();
drop trigger if exists trigger_update_plan_comments on public.plan_comments;
create trigger trigger_update_plan_comments after insert or delete on public.plan_comments
 for each row execute function spotted_private.update_plan_comments_count();

-- Repair previously missed counts while preventing concurrent child writes.
lock table public.plan_votes,public.plan_comments in share row exclusive mode;
update public.plans p set
 score=(select coalesce(sum(case when v.vote_type='up' then 1 else -1 end),0) from public.plan_votes v where v.plan_id=p.id),
 comments_count=(select count(*) from public.plan_comments c where c.plan_id=p.id);
-- Realtime is delivered under each table's existing SELECT RLS policy.
do $$
declare t text;
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['plans','plan_votes','plan_comments','plan_participants','plan_downs'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
commit;
