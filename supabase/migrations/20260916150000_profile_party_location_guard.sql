-- Second half of the private-party privacy rule.
--
-- profiles.last_known_lat/lng are served to the host's whole audience via
-- get_profiles_safe. The web client (and any background writer) updates them
-- on every check-in / GPS fix, so a party host's exact spot could still leak
-- through the profile even though it no longer rests on night_statuses.
--
-- Enforce it at the row: while the user is out at a private party, profile
-- coordinates are always nulled on write. Close friends get the exact spot
-- from party_locations; everyone else gets the neighborhood.

create or replace function public.profile_party_location_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.last_known_lat is not null or new.last_known_lng is not null)
     and exists (
       select 1 from night_statuses s
        where s.user_id = new.id
          and s.status = 'out'
          and coalesce(s.is_private_party, false)
          and s.expires_at > now()
     ) then
    new.last_known_lat := null;
    new.last_known_lng := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_party_location_guard on public.profiles;
create trigger profile_party_location_guard
  before insert or update of last_known_lat, last_known_lng on public.profiles
  for each row execute function public.profile_party_location_guard();

-- Backfill: anyone currently hosting a party must not carry profile coordinates.
update public.profiles p
   set last_known_lat = null, last_known_lng = null
 where (p.last_known_lat is not null or p.last_known_lng is not null)
   and exists (
     select 1 from public.night_statuses s
      where s.user_id = p.id
        and s.status = 'out'
        and coalesce(s.is_private_party, false)
        and s.expires_at > now()
   );
