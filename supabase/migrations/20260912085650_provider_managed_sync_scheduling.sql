-- phaseo:allow-production-history-backfill reason: Restore SQL already applied to production under this recorded migration version.
-- Managed catalogs are event-driven; NULL means there is no scheduled poll.
alter table public.provider_catalog_sources alter column next_poll_at drop not null;

create function public.begin_provider_catalog_refresh(p_provider_slug text)
returns void language sql set search_path = '' as $$
  update public.provider_catalog_sources
  set refresh_requested = false,
      next_poll_at = case when management_mode = 'managed' then null else next_poll_at end
  where provider_slug = p_provider_slug;
$$;
revoke all on function public.begin_provider_catalog_refresh(text) from public, anon, authenticated;
grant execute on function public.begin_provider_catalog_refresh(text) to service_role;
