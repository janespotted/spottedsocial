-- The legacy membership table has no unique pair constraint. The group row
-- lock serializes writes; only insert missing memberships under that lock.
-- Memberships remain unwritable through the table API. Lock the group so
-- concurrent additions cannot exceed capacity or race a removal.
create or replace function spotted_private.manage_group_members(p_thread uuid, p_members uuid[], p_remove boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  owner_id uuid;
  requested uuid[];
  combined uuid[];
begin
  if me is null or not coalesce(spotted_private.launch_access(), false) or not exists (
    select 1 from public.profiles where id = me and not coalesce(is_demo, false)
  ) then raise exception 'Not authenticated' using errcode = '42501'; end if;

  select created_by into owner_id from public.dm_threads
    where id = p_thread and is_group is true for update;
  if owner_id is distinct from me or not public.user_is_thread_member(p_thread) then
    raise exception 'Only the group creator can manage members' using errcode = '42501';
  end if;
  if p_members is null or cardinality(p_members) < 1 or cardinality(p_members) > 64
     or array_position(p_members, null) is not null or me = any(p_members) then
    raise exception 'Choose other group members' using errcode = '22023';
  end if;
  select array_agg(distinct u) into requested from unnest(p_members) u;

  if p_remove then
    delete from public.dm_thread_members where thread_id = p_thread and user_id = any(requested);
    delete from public.dm_read_receipts where thread_id = p_thread and user_id = any(requested);
    return;
  end if;

  if exists (select 1 from unnest(requested) u where not exists (
    select 1 from public.profiles p where p.id = u and not coalesce(p.is_demo, false)
      and spotted_private.direct_friend(me, u)
  )) then raise exception 'Members must be current friends' using errcode = '42501'; end if;
  select array_agg(distinct u) into combined from (
    select user_id as u from public.dm_thread_members where thread_id = p_thread
    union select unnest(requested)
  ) members;
  if cardinality(combined) > 65 then
    raise exception 'Groups can have up to 65 people' using errcode = '22023';
  end if;
  if exists (select 1 from public.blocked_users
    where blocker_id = any(combined) and blocked_id = any(combined)) then
    raise exception 'These members cannot share a group' using errcode = '42501';
  end if;
  insert into public.dm_thread_members(thread_id, user_id)
    select p_thread, u from unnest(requested) u
    where not exists (select 1 from public.dm_thread_members m where m.thread_id = p_thread and m.user_id = u);
end;
$$;
