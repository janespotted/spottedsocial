-- Turn the Night Mode guards (20261006100000) on or off from the app, so the
-- release can be switched over without SQL. Tester accounts only
-- (spotted_private.night_mode_testers, added by SQL) — the switch changes the
-- rules for every user, so it is not exposed to anyone else.
begin;

create or replace function public.set_night_mode_enforced(p_on boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null then raise exception 'Not authenticated' using errcode='42501';end if;
 if p_on is null then raise exception 'Invalid value';end if;
 if not exists(select 1 from spotted_private.night_mode_testers where user_id=me) then
  raise exception 'Not a tester account' using errcode='42501';end if;
 update spotted_private.night_mode_settings set enforced=p_on;
 return public.get_night_mode();
end $$;

revoke all on function public.set_night_mode_enforced(boolean) from public,anon;
grant execute on function public.set_night_mode_enforced(boolean) to authenticated;
commit;
