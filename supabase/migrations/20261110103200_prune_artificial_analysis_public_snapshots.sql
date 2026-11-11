-- phaseo:allow-destructive-migration reason: weekly retention for AA public dashboard snapshot payloads only (the prune function body contains DELETE FROM); the migration itself deletes nothing and artificial_analysis_snapshots stays immutable
-- Keeps the newest artificial_analysis_public_snapshots row per (major_version, methodology_version) plus every row fetched
-- in the last 14 days; deletes the rest weekly. The first run clears the existing backlog with the same bounded job.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

CREATE OR REPLACE FUNCTION private.prune_artificial_analysis_public_snapshots (
  p_batch_size integer DEFAULT 50
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '60s'
  SET lock_timeout TO '5s'
  AS $function$
declare
  v_deleted integer;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 100 then
    raise exception 'AA public snapshot prune batch size must be between 1 and 100';
  end if;
  -- Same lock as publish_artificial_analysis_public_snapshot, so its stale-data checks never see a half-pruned table.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('artificial-analysis-public-data', 0));
  -- Keep the newest snapshot per (major_version, methodology_version), which includes the newest per major
  -- (the only one get_artificial_analysis_public_models and the progress-index sync read) and the newest
  -- fetched_at and methodology overall (what the publisher's stale checks compare against), plus every
  -- snapshot fetched in the last 14 days.
  with keep as (
    select distinct on (s.major_version, s.methodology_version) s.snapshot_id
    from public.artificial_analysis_public_snapshots s
    order by s.major_version, s.methodology_version, s.fetched_at desc, s.snapshot_id desc
  ),
  candidates as (
    select s.snapshot_id
    from public.artificial_analysis_public_snapshots s
    where s.fetched_at < now() - interval '14 days'
      and not exists (select 1 from keep k where k.snapshot_id = s.snapshot_id)
    order by s.fetched_at, s.snapshot_id
    limit p_batch_size
  )
  delete from public.artificial_analysis_public_snapshots s
  using candidates c
  where s.snapshot_id = c.snapshot_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

REVOKE ALL ON FUNCTION private.prune_artificial_analysis_public_snapshots(integer) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.prune_artificial_analysis_public_snapshots(integer) IS 'Weekly retention for AA public dashboard snapshots: keeps the newest snapshot per major and methodology version plus everything fetched in the last 14 days. artificial_analysis_snapshots (the API import record) is not touched.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-artificial-analysis-public-snapshots') then
    perform cron.unschedule('prune-artificial-analysis-public-snapshots');
  end if;
end
$$;

select cron.schedule('prune-artificial-analysis-public-snapshots', '37 4 * * 0',
  $job$set statement_timeout = '60s'; set lock_timeout = '5s'; select private.prune_artificial_analysis_public_snapshots(50);$job$);
