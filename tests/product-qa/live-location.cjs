// Local-only fixture: never connects to Supabase or sends notifications.
const { PGlite } = require(process.env.SPOTTED_PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(read('tests/notifications/bootstrap.sql'));
    await db.exec(`
      create table auth.users(id uuid primary key);
      grant usage on schema auth to authenticated;
      alter table public.profiles add column is_out boolean default false,
        add column last_known_lat double precision, add column last_known_lng double precision,
        add column last_location_at timestamptz;
      alter table public.night_statuses add column lat double precision,
        add column lng double precision, add column updated_at timestamptz default now();
      create table public.venues(id uuid primary key,name text,neighborhood text,type text,
        city text,lat double precision,lng double precision,is_demo boolean default false);
      create table public.checkins(id uuid primary key default gen_random_uuid(),user_id uuid,
        venue_id uuid,venue_name text,lat double precision,lng double precision,
        started_at timestamptz,last_updated_at timestamptz,ended_at timestamptz);
      grant select on public.venues to authenticated;
      grant select,insert,update,delete on public.profiles,public.night_statuses,public.checkins to authenticated;
      alter table public.profiles enable row level security;
      alter table public.night_statuses enable row level security;
      alter table public.checkins enable row level security;
      create policy own_profile on public.profiles for all to authenticated
        using(id=auth.uid()) with check(id=auth.uid());
      create policy own_status on public.night_statuses for all to authenticated
        using(user_id=auth.uid()) with check(user_id=auth.uid());
      create policy own_checkins on public.checkins for all to authenticated
        using(user_id=auth.uid()) with check(user_id=auth.uid());
    `);
    for (const name of [
      '20260922173438_reliable_live_location',
      '20260922205151_reliable_notification_delivery',
      '20260922213920_nightlife_notification_coverage',
      '20260922220927_spotted_notification_voice',
      '20260925180903_v1_product_atomic_location',
    ]) await db.exec(read(`supabase/migrations/${name}.sql`));
    const regression = read('supabase/tests/reliable_live_location.sql');
    await db.exec(regression);
    console.log(`PASS original location SQL regression (${(regression.match(/\bassert\b/g) || []).length} assertions plus authorization exception checks) against the final record_live_location implementation in the original isolated fixture`);
  } finally { await db.close(); }
})().catch(error => { console.error(error.message, error.where); process.exitCode = 1; });
