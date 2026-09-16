-- phaseo:allow-production-history-backfill reason: Restore this already-applied production migration from supabase_migrations.schema_migrations so deployment history matches main.
-- Promote provider-catalog routes after their provider-selected release time.
-- Five-minute cadence bounds database-side activation delay without relying on
-- an application deployment or cache purge.
create extension if not exists pg_cron with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'activate-provider-catalog-releases';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end;
$$;

select cron.schedule(
  'activate-provider-catalog-releases',
  '*/5 * * * *',
  'select public.activate_due_provider_catalog_releases()'
);
