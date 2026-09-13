-- phaseo:allow-production-history-backfill reason: Restore SQL already applied to production under this recorded migration version.
-- UI-managed catalogs need no publicly hosted JSON document.
alter table public.provider_catalog_sources alter column catalog_url drop not null;
alter table public.provider_catalog_sync_runs alter column catalog_url drop not null;
alter table public.provider_onboarding_submissions alter column catalog_url drop not null;
alter table public.provider_catalog_sources add constraint provider_catalog_sources_remote_url_required
  check (management_mode = 'managed' or catalog_url is not null);
