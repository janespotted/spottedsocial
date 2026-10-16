begin;
-- Separate account overrides do not grant access to the legacy global switch.
create table spotted_private.admin_mode_overrides (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text check (mode in ('day','night')),
  updated_at timestamptz not null default now()
);
alter table spotted_private.admin_mode_overrides enable row level security;
revoke all on spotted_private.admin_mode_overrides from public, anon, authenticated;

create function spotted_private.can_test_app(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_user is not null and (
    exists(select 1 from spotted_private.launch_operators where user_id=p_user and (city_tester or wave_admin))
    or exists(select 1 from spotted_private.night_mode_testers where user_id=p_user)
  )
$$;
create function spotted_private.account_mode_override(p_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select case when spotted_private.can_test_app(p_user) then
    case when exists(select 1 from spotted_private.admin_mode_overrides where user_id=p_user)
      then (select mode from spotted_private.admin_mode_overrides where user_id=p_user)
      else (select override from spotted_private.night_mode_testers where user_id=p_user) end
  end
$$;
revoke all on function spotted_private.can_test_app(uuid), spotted_private.account_mode_override(uuid) from public, anon, authenticated;

create or replace function spotted_private.night_mode_open_for(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(spotted_private.account_mode_override(p_user)='night',
    public.is_night_mode((select city from public.profiles where id=p_user)))
$$;
create or replace function spotted_private.night_mode_blocks(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case spotted_private.account_mode_override(p_user)
    when 'night' then false when 'day' then true
    else (select enforced from spotted_private.night_mode_settings)
      and not public.is_night_mode((select city from public.profiles where id=p_user)) end
$$;

create function spotted_private.get_admin_night_mode() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); c text;
begin
  if me is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select city into c from public.profiles where id=me;
  return jsonb_build_object('city',coalesce(c,'nyc'),'opens_at',public.night_mode_opens_at(c),
    'open',spotted_private.night_mode_open_for(me),'enforced',(select enforced from spotted_private.night_mode_settings),
    'tester',spotted_private.can_test_app(me),'override',spotted_private.account_mode_override(me));
end $$;
create function spotted_private.set_admin_night_mode(p_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
  if not spotted_private.can_test_app(me) then raise exception 'Admin testing access required' using errcode='42501'; end if;
  if p_mode is null or p_mode not in ('auto','day','night') then raise exception 'Invalid mode' using errcode='22023'; end if;
  insert into spotted_private.admin_mode_overrides(user_id,mode) values(me,nullif(p_mode,'auto'))
    on conflict(user_id) do update set mode=excluded.mode,updated_at=now();
  return spotted_private.get_admin_night_mode();
end $$;
revoke all on function spotted_private.get_admin_night_mode(),spotted_private.set_admin_night_mode(text) from public, anon;
grant execute on function spotted_private.get_admin_night_mode(),spotted_private.set_admin_night_mode(text) to authenticated;
create or replace function public.get_night_mode() returns jsonb language sql set search_path='' as $$
  select spotted_private.get_admin_night_mode()
$$;
create or replace function public.set_night_mode_override(p_mode text) returns jsonb language sql set search_path='' as $$
  select spotted_private.set_admin_night_mode(p_mode)
$$;
-- CREATE OR REPLACE retains the old SECURITY DEFINER flag unless explicitly reset.
alter function public.get_night_mode() security invoker;
alter function public.set_night_mode_override(text) security invoker;
revoke all on function public.get_night_mode(),public.set_night_mode_override(text) from public, anon;
grant execute on function public.get_night_mode(),public.set_night_mode_override(text) to authenticated;
commit;
