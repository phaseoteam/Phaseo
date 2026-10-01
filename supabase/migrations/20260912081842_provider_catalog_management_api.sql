-- phaseo:allow-production-history-backfill reason: Restore SQL already applied to production under this recorded migration version.
-- Allow an authorized provider workspace to manage a catalog in Phaseo while
-- preserving the existing remote URL sync mode. The managed document contains
-- public model metadata only; credentials and endpoint configuration remain
-- outside the provider catalog surface.

alter table public.provider_catalog_sources
  add column if not exists management_mode text not null default 'remote',
  add column if not exists managed_catalog jsonb,
  add column if not exists managed_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists managed_updated_at timestamptz;

alter table public.provider_catalog_sources
  drop constraint if exists provider_catalog_sources_management_mode_check;
alter table public.provider_catalog_sources
  add constraint provider_catalog_sources_management_mode_check
  check (management_mode in ('remote', 'managed'));

alter table public.provider_catalog_sources
  drop constraint if exists provider_catalog_sources_managed_catalog_check;
alter table public.provider_catalog_sources
  add constraint provider_catalog_sources_managed_catalog_check
  check (managed_catalog is null or jsonb_typeof(managed_catalog) = 'object');

create index if not exists provider_catalog_sources_management_mode_idx
  on public.provider_catalog_sources (management_mode, updated_at desc);

comment on column public.provider_catalog_sources.management_mode is
  'Catalog authority: remote provider URL or a provider-managed Phaseo document.';
comment on column public.provider_catalog_sources.managed_catalog is
  'Provider-managed catalog document in the validated {data: [...]} contract shape.';
