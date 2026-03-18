-- Daily nudge pg_cron jobs
-- Thu-Sat evenings: nudge 1 at 8pm ET, nudge 2 at 10pm ET
-- EDT (UTC-4): 8pm ET = 00:00 UTC next day, 10pm ET = 02:00 UTC next day
-- Thu 8pm ET = Fri 00:00 UTC, Fri 8pm ET = Sat 00:00 UTC, Sat 8pm ET = Sun 00:00 UTC
-- So cron days: 5 (Fri), 6 (Sat), 0 (Sun) in UTC

-- Helper function to invoke the edge function via pg_net
-- Reads service_role_key from Supabase Vault (must be stored there first)
create or replace function public.invoke_daily_nudge(p_nudge_number int)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_service_key text;
  v_url text;
begin
  -- Read service role key from vault
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_service_key is null then
    raise warning '[NUDGE CRON] service_role_key not found in vault, skipping';
    return;
  end if;

  v_url := 'https://nkjdthjpqomfsqyzfwbj.supabase.co/functions/v1/send-daily-nudge';

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('nudge_number', p_nudge_number)
  );
end;
$$;

-- First nudge: 8pm ET Thu-Sat = 00:00 UTC Fri-Sun
select cron.schedule(
  'daily-nudge-8pm',
  '0 0 * * 5,6,0',
  'select public.invoke_daily_nudge(1)'
);

-- Second nudge: 10pm ET Thu-Sat = 02:00 UTC Fri-Sun
select cron.schedule(
  'daily-nudge-10pm',
  '0 2 * * 5,6,0',
  'select public.invoke_daily_nudge(2)'
);
