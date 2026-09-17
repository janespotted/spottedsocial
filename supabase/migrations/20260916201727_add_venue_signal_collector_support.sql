-- Applied directly to the linked project on 2026-09-16 (outside this repo);
-- copied from supabase_migrations.schema_migrations so local history matches.

alter table public.venue_signal_events
  add column if not exists external_id text;

create unique index if not exists idx_venue_signal_events_external
  on public.venue_signal_events (venue_id, source, external_id)
  where external_id is not null;

create table if not exists public.venue_aliases (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  alias text not null,
  alias_type text not null default 'canonical' check (alias_type in ('canonical','internet','manual')),
  created_at timestamptz not null default now()
);
create index if not exists idx_venue_aliases_venue_id on public.venue_aliases (venue_id);
create index if not exists idx_venue_aliases_alias_lower on public.venue_aliases (lower(alias));
alter table public.venue_aliases enable row level security;
revoke all on table public.venue_aliases from anon, authenticated;

insert into public.venue_aliases (venue_id, alias, alias_type)
select v.id, v.name, 'canonical'
from public.venues v
where not exists (
  select 1 from public.venue_aliases a
  where a.venue_id = v.id and lower(a.alias) = lower(v.name)
);

insert into public.venue_aliases (venue_id, alias, alias_type)
select v.id,
       trim(regexp_replace(v.name, '\s+(GP|CG|EV|NYC|LES)$', '', 'i')),
       'internet'
from public.venues v
where v.name ~* '\s+(GP|CG|EV|NYC|LES)$'
  and length(trim(regexp_replace(v.name, '\s+(GP|CG|EV|NYC|LES)$', '', 'i'))) >= 3
  and not exists (
    select 1 from public.venue_aliases a
    where a.venue_id = v.id
      and lower(a.alias) = lower(trim(regexp_replace(v.name, '\s+(GP|CG|EV|NYC|LES)$', '', 'i')))
  );

create table if not exists public.venue_signal_scan_state (
  venue_id uuid not null references public.venues(id) on delete cascade,
  source text not null,
  last_scanned_at timestamptz,
  last_result_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (venue_id, source)
);
alter table public.venue_signal_scan_state enable row level security;
revoke all on table public.venue_signal_scan_state from anon, authenticated;

create table if not exists internal.venue_collector_config (
  id integer primary key default 1 check (id = 1),
  secret_sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on table internal.venue_collector_config from public, anon, authenticated;

create or replace function public.verify_venue_collector_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public, internal, extensions, pg_catalog
as $$
  select coalesce(
    encode(extensions.digest(p_secret, 'sha256'), 'hex') =
      (select secret_sha256 from internal.venue_collector_config where id = 1),
    false
  );
$$;
revoke all on function public.verify_venue_collector_secret(text) from public, anon, authenticated;
grant execute on function public.verify_venue_collector_secret(text) to service_role;

create extension if not exists pg_net with schema extensions;

do $$
declare
  s text;
begin
  if not exists (select 1 from internal.venue_collector_config where id = 1) then
    s := encode(extensions.gen_random_bytes(32), 'hex');
    insert into internal.venue_collector_config (id, secret_sha256)
    values (1, encode(extensions.digest(s, 'sha256'), 'hex'));
    perform vault.create_secret(s, 'venue_collector_secret');
  end if;
end $$;
