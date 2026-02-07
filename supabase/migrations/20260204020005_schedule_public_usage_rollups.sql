-- Schedule public usage rollup refresh via pg_cron (Supabase)

create extension if not exists pg_cron with schema extensions;

-- Ensure idempotent schedule
select cron.unschedule('refresh-public-usage-rollups');

-- Refresh recent buckets hourly (last 90 days)
select cron.schedule(
  'refresh-public-usage-rollups',
  '0 * * * *',
  $$select public.refresh_public_usage_rollups(now() - interval '90 days');$$
);
