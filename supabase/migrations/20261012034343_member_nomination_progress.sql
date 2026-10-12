-- Read-only member progress. No admission, sending, or table-access changes.
-- The caller cannot supply a phone or another member's ID.
create function spotted_private.my_nomination_progress() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := auth.uid(); result jsonb;
begin
  if caller is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select jsonb_build_object('nominations', coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'slot', n.slot, 'phone', n.phone,
    'status', case
      when m.completed_at is not null or exists (
        select 1 from auth.users a join spotted_private.launch_members lm on lm.user_id = a.id
        where a.phone in (n.phone, substring(n.phone from 2))
          and a.phone_confirmed_at is not null and lm.completed_at is not null
      ) then 'joined'
      when g.claimed_at is not null then 'joining'
      when g.revoked_at is not null then 'unavailable'
      when w.status = 'paused' then 'paused'
      when g.invited_at is not null then 'invited'
      when g.activated_at is not null and w.status = 'open' then 'ready'
      else 'waiting' end
  ) order by n.slot), '[]'::jsonb)) into result
  from spotted_private.launch_nominations n
  left join spotted_private.launch_guests g on g.nomination_id = n.id and g.nominated_by = caller
  left join spotted_private.launch_waves w on w.id = g.wave_id
  left join spotted_private.launch_members m on m.user_id = coalesce(g.claimed_by, n.claimed_by)
  where n.nominated_by = caller;
  return result;
end $$;

create function public.get_my_nomination_progress() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select spotted_private.my_nomination_progress()
$$;
revoke all on function spotted_private.my_nomination_progress() from public, anon, authenticated;
revoke all on function public.get_my_nomination_progress() from public, anon, authenticated;
grant execute on function spotted_private.my_nomination_progress() to authenticated;
grant execute on function public.get_my_nomination_progress() to authenticated;
