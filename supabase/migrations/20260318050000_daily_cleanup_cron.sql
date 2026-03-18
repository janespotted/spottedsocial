-- Schedule daily-cleanup edge function at 5:10 AM ET (10:10 UTC, DST-safe)
-- Uses pg_net to invoke the edge function with the service role key from vault

create or replace function public.invoke_daily_cleanup()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_service_key text;
  v_url text;
begin
  select decrypted_secret into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if v_service_key is null then
    raise warning '[DAILY CLEANUP] service_role_key not found in vault, skipping';
    return;
  end if;

  v_url := 'https://nkjdthjpqomfsqyzfwbj.supabase.co/functions/v1/daily-cleanup';

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Remove any stale schedule if it exists
select cron.unschedule('daily-cleanup')
where exists (
  select 1 from cron.job where jobname = 'daily-cleanup'
);

-- 10:10 UTC = 5:10 AM ET (EST is UTC-5; during EDT this fires at 6:10 AM ET,
-- but the edge function itself calculates the 5 AM ET cutoff DST-aware)
select cron.schedule(
  'daily-cleanup',
  '10 10 * * *',
  'select public.invoke_daily_cleanup()'
);
