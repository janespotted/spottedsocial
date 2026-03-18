-- Throttle table: ensures "X friends at venue" notification fires
-- at most once per venue per night per recipient.

create table if not exists public.venue_notif_throttle (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  venue_id uuid references venues(id) on delete cascade not null,
  notified_date date not null default current_date,
  created_at timestamptz default now()
);

-- One notification per user per venue per day
create unique index if not exists idx_venue_notif_throttle_unique
  on venue_notif_throttle(user_id, venue_id, notified_date);

-- Fast lookup by venue + date
create index if not exists idx_venue_notif_throttle_venue_date
  on venue_notif_throttle(venue_id, notified_date);

-- RLS: users can read their own throttle records, inserts go through app
alter table venue_notif_throttle enable row level security;

create policy "Users can view own throttle records"
  on venue_notif_throttle for select
  using (user_id = auth.uid());

create policy "Authenticated users can insert throttle records"
  on venue_notif_throttle for insert
  with check (auth.uid() is not null);

-- Clean up records older than 2 days (run via pg_cron daily)
create or replace function public.cleanup_venue_notif_throttle()
returns void
language sql
security definer
set search_path = 'public'
as $$
  delete from venue_notif_throttle
  where notified_date < current_date - interval '2 days';
$$;

select cron.schedule(
  'cleanup-venue-notif-throttle',
  '0 6 * * *',
  'select public.cleanup_venue_notif_throttle()'
);
