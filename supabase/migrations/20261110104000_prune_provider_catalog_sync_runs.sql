-- phaseo:allow-destructive-migration reason: bounded daily retention for provider catalog sync runs that excludes every referenced or human-reviewed run (the prune function body contains DELETE FROM); the migration itself deletes nothing
-- Keeps the newest 50 runs per provider (overall, per kind and per review status), the newest applied runs, the last
-- 7 days, and every run referenced by review events, catalog events, model requests, route candidates, catalog models
-- or capabilities. The first runs clear the existing backlog with the same bounded job.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

CREATE OR REPLACE FUNCTION private.prune_provider_catalog_sync_runs (
  p_keep integer DEFAULT 50,
  p_batch_size integer DEFAULT 1000
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '60s'
  SET lock_timeout TO '5s'
  AS $function$
declare
  v_ids uuid[];
  v_deleted integer;
begin
  if p_keep is null or p_keep < 20 or p_keep > 1000 then
    raise exception 'Provider catalog run retention must keep between 20 and 1000 runs per provider';
  end if;
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'Provider catalog run prune batch size must be between 1 and 5000';
  end if;

  -- Per provider, keep what any screen or sync step can read: the newest p_keep runs overall, of each kind
  -- (not_modified vs the rest, which the onboarding and catalog settings pages list), and of each review
  -- status (the internal review queue filter); the newest applied run, and the newest applied run that was not
  -- rejected (chat preview access and the onboarding preview); anything from the last 7 days or still processing;
  -- and any run a person reviewed.
  select coalesce(array_agg(c.id), '{}') into v_ids
  from (
    select r.id
    from (
      select s.id, s.status, s.review_status, s.created_at, s.reviewed_by, s.reviewed_at,
        row_number() over (partition by s.provider_slug order by s.created_at desc, s.id desc) as rn_all,
        row_number() over (partition by s.provider_slug, (s.status = 'not_modified') order by s.created_at desc, s.id desc) as rn_kind,
        row_number() over (partition by s.provider_slug, s.review_status order by s.created_at desc, s.id desc) as rn_review,
        row_number() over (partition by s.provider_slug, (s.status = 'applied') order by s.created_at desc, s.id desc) as rn_applied,
        row_number() over (partition by s.provider_slug, (s.status = 'applied' and s.review_status <> 'rejected') order by s.created_at desc, s.id desc) as rn_applied_ok
      from public.provider_catalog_sync_runs s
    ) r
    where r.rn_all > p_keep and r.rn_kind > p_keep and r.rn_review > p_keep
      and not (r.status = 'applied' and r.rn_applied = 1)
      and not (r.status = 'applied' and r.review_status <> 'rejected' and r.rn_applied_ok = 1)
      and r.created_at < now() - interval '7 days'
      and r.status <> 'processing'
      and r.reviewed_by is null and r.reviewed_at is null
      and not exists (select 1 from public.provider_catalog_review_events e where e.run_id = r.id)
      and not exists (select 1 from public.provider_catalog_events e where e.run_id = r.id)
      and not exists (select 1 from public.provider_catalog_model_requests e where e.source_run_id = r.id)
      and not exists (select 1 from public.provider_catalog_route_candidates e where e.run_id = r.id)
      and not exists (select 1 from public.provider_catalog_models e where e.source_run_id = r.id)
      and not exists (select 1 from public.provider_catalog_model_capabilities e where e.source_run_id = r.id)
      and not exists (select 1 from public.provider_catalog_sync_models m where m.run_id = r.id and m.reviewed_by is not null)
    order by r.created_at, r.id
    limit p_batch_size
  ) c;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  -- Never delete a run another table points at (review events would block it; the rest would cascade or lose
  -- provenance), or one with a person's model decision. Checked when choosing the batch (so referenced runs never
  -- fill it) and again in the deleting statement's own snapshot.
  -- The run's provider_catalog_sync_models and their capabilities go with it (ON DELETE CASCADE).
  delete from public.provider_catalog_sync_runs r
  where r.id = any (v_ids)
    and not exists (select 1 from public.provider_catalog_review_events e where e.run_id = r.id)
    and not exists (select 1 from public.provider_catalog_events e where e.run_id = r.id)
    and not exists (select 1 from public.provider_catalog_model_requests e where e.source_run_id = r.id)
    and not exists (select 1 from public.provider_catalog_route_candidates e where e.run_id = r.id)
    and not exists (select 1 from public.provider_catalog_models e where e.source_run_id = r.id)
    and not exists (select 1 from public.provider_catalog_model_capabilities e where e.source_run_id = r.id)
    and not exists (select 1 from public.provider_catalog_sync_models m where m.run_id = r.id and m.reviewed_by is not null);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

REVOKE ALL ON FUNCTION private.prune_provider_catalog_sync_runs(integer, integer) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.prune_provider_catalog_sync_runs(integer, integer) IS 'Daily retention for provider catalog sync runs: deletes old runs outside every per-provider window that a screen or sync step reads, never a run that another table references or a person reviewed. Sync models and capabilities of deleted runs cascade.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune-provider-catalog-sync-runs') then
    perform cron.unschedule('prune-provider-catalog-sync-runs');
  end if;
end
$$;

select cron.schedule('prune-provider-catalog-sync-runs', '47 3 * * *',
  $job$set statement_timeout = '60s'; set lock_timeout = '5s'; select private.prune_provider_catalog_sync_runs(50, 1000);$job$);
