-- Schedule public usage rollup refresh via pg_cron (Supabase)

create extension if not exists pg_cron with schema extensions;
-- Ensure idempotent schedule (ignore if missing)
do $$
declare
  v_job_id int;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'refresh-public-usage-rollups'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
exception
  when others then
    -- best-effort: ignore if cron schema isn't ready or job doesn't exist
    null;
end $$;
-- Refresh recent buckets hourly (last 90 days)
select cron.schedule(
  'refresh-public-usage-rollups',
  '0 * * * *',
  $$select public.refresh_public_usage_rollups(now() - interval '90 days');$$
);
