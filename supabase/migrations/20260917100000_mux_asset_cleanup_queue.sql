-- ═════════════════════════════════════════════════════════════════════
-- Mux asset cleanup queue (addendum v3 §2 / §4).
--
-- Video posts live on Mux; the post row only holds mux_asset_id. The
-- scheduled nightly_reset() (SQL) deletes expired post rows but cannot call
-- Mux, and the only Mux deletion code lived in the daily-cleanup edge
-- function, which is not scheduled — so every expired video asset was
-- orphaned on Mux (billable storage). Same for a post the user deletes.
--
-- Fix: a trigger queues the asset id whenever a post row that carries one is
-- deleted, for ANY reason (nightly reset, user delete, account delete
-- cascade). The `mux-cleanup` edge function drains the queue; pg_cron
-- invokes it through pg_net twenty minutes after each city's reset and once
-- an hour otherwise. The function needs no secret: it only ever deletes
-- assets already queued for a deleted post, and re-running it is harmless.
-- ═════════════════════════════════════════════════════════════════════

create table if not exists public.mux_asset_deletions (
  asset_id    text primary key,
  queued_at   timestamptz not null default now(),
  attempts    int not null default 0,
  last_error  text
);
comment on table public.mux_asset_deletions is
  'Mux assets whose post row is gone; drained by the mux-cleanup edge function.';

-- Service role only (edge function); no client policy.
alter table public.mux_asset_deletions enable row level security;

create or replace function public.queue_mux_asset_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.mux_asset_id is not null then
    insert into mux_asset_deletions (asset_id)
    values (old.mux_asset_id)
    on conflict (asset_id) do nothing;
  end if;
  return old;
end;
$$;

drop trigger if exists posts_queue_mux_asset_deletion on public.posts;
create trigger posts_queue_mux_asset_deletion
  after delete on public.posts
  for each row execute function public.queue_mux_asset_deletion();

-- Also catch a row whose asset is swapped (re-upload) — the old asset is
-- unreachable the moment the column changes.
create or replace function public.queue_replaced_mux_asset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.mux_asset_id is not null and old.mux_asset_id is distinct from new.mux_asset_id then
    insert into mux_asset_deletions (asset_id)
    values (old.mux_asset_id)
    on conflict (asset_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_queue_replaced_mux_asset on public.posts;
create trigger posts_queue_replaced_mux_asset
  after update of mux_asset_id on public.posts
  for each row execute function public.queue_replaced_mux_asset();

-- ── Schedule the drain ───────────────────────────────────────────────
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_mux_cleanup()
returns void
language sql
security definer
set search_path = public, extensions
as $$
  select net.http_post(
    url     := 'https://rwavbyvdytdegntdryll.supabase.co/functions/v1/mux-cleanup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'mux-cleanup-hourly';
exception when others then null;
end $$;
-- :20 past every hour covers both resets (10:10 / 13:10 UTC) with a margin
-- and clears user-deleted videos within the hour.
select cron.schedule('mux-cleanup-hourly', '20 * * * *', $$select public.invoke_mux_cleanup()$$);
