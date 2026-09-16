-- ═════════════════════════════════════════════════════════════════════
-- Private party exact location → its own table, close friends only.
--
-- The check-in copy promises "only Close Friends see your exact spot".
-- night_statuses rows are readable by the host's whole audience (so Plans
-- can show "Private Party (Williamsburg)"), and row-level security cannot
-- hide two columns from some readers, so keeping lat/lng on that row leaks
-- the exact spot to every direct friend via the API.
--
-- Fix: the sensitive coordinates live in party_locations, one row per host,
-- whose SELECT policy is "self, or a close friend who may see the host's
-- location". A trigger on night_statuses moves coordinates there and nulls
-- them on the status row for EVERY writer (mobile, web, edge functions,
-- seeds) — no client has to remember the rule.
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.party_locations (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);

comment on table public.party_locations is
  'Exact GPS of a private party host for TONIGHT. Readable only by the host and their close friends; the neighborhood-only status stays on night_statuses.';

alter table public.party_locations enable row level security;

drop policy if exists "Party location: self or close friend" on public.party_locations;
create policy "Party location: self or close friend" on public.party_locations
  for select using (
    auth.uid() = user_id
    or (
      public.can_see_location(auth.uid(), user_id)   -- blocks, hidden-from, audience
      and public.is_close_friend(auth.uid(), user_id) -- host has starred the viewer
    )
  );

drop policy if exists "Party location: self insert" on public.party_locations;
create policy "Party location: self insert" on public.party_locations
  for insert with check (auth.uid() = user_id);

drop policy if exists "Party location: self update" on public.party_locations;
create policy "Party location: self update" on public.party_locations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Party location: self delete" on public.party_locations;
create policy "Party location: self delete" on public.party_locations
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.party_locations to authenticated;
grant all on public.party_locations to service_role;

-- ── Trigger: coordinates never rest on a private-party status row ────────
create or replace function public.night_status_party_location_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_private_party, false) then
    if new.lat is not null and new.lng is not null and new.expires_at is not null then
      insert into party_locations (user_id, lat, lng, expires_at, updated_at)
      values (new.user_id, new.lat, new.lng, new.expires_at, now())
      on conflict (user_id) do update
        set lat = excluded.lat,
            lng = excluded.lng,
            expires_at = excluded.expires_at,
            updated_at = now();
    end if;
    -- The status row keeps only the neighborhood.
    new.lat := null;
    new.lng := null;
  else
    -- Any other status ends the party: drop the exact spot.
    delete from party_locations where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists night_status_party_location_guard on public.night_statuses;
create trigger night_status_party_location_guard
  before insert or update on public.night_statuses
  for each row execute function public.night_status_party_location_guard();

-- ── Backfill: move coordinates off every existing private-party row ─────
insert into public.party_locations (user_id, lat, lng, expires_at, updated_at)
select user_id, lat, lng, expires_at, now()
  from public.night_statuses
 where coalesce(is_private_party, false)
   and lat is not null and lng is not null
   and expires_at is not null and expires_at > now()
on conflict (user_id) do update
  set lat = excluded.lat, lng = excluded.lng, expires_at = excluded.expires_at, updated_at = now();

update public.night_statuses
   set lat = null, lng = null
 where coalesce(is_private_party, false)
   and (lat is not null or lng is not null);

-- ── Nightly reset also clears expired party spots ────────────────────────
create or replace function public.nightly_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_conservative timestamptz := least(night_start_at('nyc', now()), night_start_at('la', now()));
  n int;
  result jsonb := '{}'::jsonb;
begin
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

  raise notice '[nightly_reset] %', result;
  return result;
end;
$$;

revoke all on function public.nightly_reset() from public, anon, authenticated;
