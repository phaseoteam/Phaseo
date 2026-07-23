-- Remove canonical models invented by the original models.dev enrichment import.
-- models.dev is a provider/route enrichment source only; canonical models must
-- already exist in the repository-authored catalogue.

do $$
begin
  create temporary table synthetic_models_dev_models on commit drop as
  select model_slug
  from public.v2_models
  where metadata ->> 'source' = 'models.dev';

  -- These rollups deliberately use restrictive model foreign keys. Imported
  -- synthetic models never carried genuine telemetry, but deleting any rows
  -- here makes the cleanup deterministic in every environment.
  delete from public.v2_private_usage_daily
  where model_slug in (select model_slug from synthetic_models_dev_models);

  delete from public.v2_public_usage_daily
  where model_slug in (select model_slug from synthetic_models_dev_models);

  delete from public.v2_public_usage_hourly
  where model_slug in (select model_slug from synthetic_models_dev_models);

  -- Routes, capabilities, variants, pricing, aliases, benchmark results,
  -- subscriptions, and provider-health rows cascade from the canonical model.
  -- Request facts retain history and set their model slug references to null.
  delete from public.v2_models
  where model_slug in (select model_slug from synthetic_models_dev_models);

  -- Remove only importer-created labs that are now completely unreferenced.
  delete from public.v2_labs lab
  where lab.metadata ->> 'source' = 'models.dev'
    and not exists (
      select 1 from public.v2_models model where model.lab_slug = lab.lab_slug
    )
    and not exists (
      select 1 from public.v2_providers provider where provider.lab_slug = lab.lab_slug
    );
end
$$;

comment on table public.v2_models is
  'Canonical repository-authored model catalogue. External enrichment importers must never create model identities.';
