-- phaseo:allow-production-history-backfill reason: Restore SQL already applied to production under this recorded migration version.
-- Public REST access must enforce the same parent visibility as server projections.
-- Private provider/admin previews remain server-authorized service-role requests.
create or replace function public.catalog_model_is_public(p_model_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.v2_models m
    where m.model_slug = p_model_slug and m.hidden = false
      and m.status not in ('disabled', 'not_ready', 'coming_soon', 'testing', 'draft', 'pending')
      and (m.released_at is null or m.released_at <= now())
      and not exists (select 1 from public.v2_model_provider_routes r where r.model_slug = m.model_slug and r.is_stealth)
  );
$$;
revoke all on function public.catalog_model_is_public(text) from public;
grant execute on function public.catalog_model_is_public(text) to anon, authenticated, service_role;

create policy provider_catalog_public_guard on public.v2_providers
as restrictive for select to anon, authenticated using (
  status not in ('not_ready', 'coming_soon', 'testing', 'draft', 'pending')
  -- Raw metadata contains enrollment identities. Published self-serve providers
  -- are exposed only through the server's explicit public projection, not select *.
  and not (coalesce(metadata, '{}'::jsonb) ? 'self_serve')
);
create policy provider_catalog_public_guard on public.v2_models
as restrictive for select to anon, authenticated using (public.catalog_model_is_public(model_slug));
create policy provider_catalog_public_guard on public.v2_model_provider_routes
as restrictive for select to anon, authenticated using (
  access_scope = 'public' and is_stealth = false
  and phaseo_status not in ('testing', 'draft', 'pending')
  and provider_availability_status not in ('not_ready', 'coming_soon')
  and public.catalog_model_is_public(model_slug)
  and exists (select 1 from public.v2_providers p where p.provider_slug = v2_model_provider_routes.provider_slug)
);
create policy provider_catalog_public_guard on public.v2_route_variants
as restrictive for select to anon, authenticated using (
  exists (select 1 from public.v2_model_provider_routes r where r.provider_model_id = v2_route_variants.provider_model_id)
);
create policy provider_catalog_public_guard on public.v2_route_capabilities
as restrictive for select to anon, authenticated using (
  exists (select 1 from public.v2_model_provider_routes r where r.provider_model_id = v2_route_capabilities.provider_model_id)
);
create policy provider_catalog_public_guard on public.v2_provider_regions
as restrictive for select to anon, authenticated using (
  exists (select 1 from public.v2_providers p where p.provider_slug = v2_provider_regions.provider_slug)
);
create policy provider_catalog_public_guard on public.v2_pricing_skus
as restrictive for select to anon, authenticated using (
  exists (select 1 from public.v2_model_provider_routes r where r.provider_model_id = v2_pricing_skus.provider_model_id)
  and (route_variant_id is null or exists (select 1 from public.v2_route_variants v where v.variant_id = v2_pricing_skus.route_variant_id))
);
create policy provider_catalog_public_guard on public.v2_pricing_sku_meters
as restrictive for select to anon, authenticated using (
  exists (select 1 from public.v2_pricing_skus s where s.sku_id = v2_pricing_sku_meters.sku_id)
);
create policy provider_catalog_public_guard on public.v2_model_aliases
as restrictive for select to anon, authenticated using (public.catalog_model_is_public(model_slug));
create policy provider_catalog_public_guard on public.v2_model_details
as restrictive for select to anon, authenticated using (public.catalog_model_is_public(model_slug));
create policy provider_catalog_public_guard on public.v2_model_links
as restrictive for select to anon, authenticated using (public.catalog_model_is_public(model_slug));
create policy provider_catalog_public_guard on public.v2_model_page_notices
as restrictive for select to anon, authenticated using (public.catalog_model_is_public(model_slug));
create policy provider_catalog_public_guard on public.v2_benchmark_results
as restrictive for select to anon, authenticated using (public.catalog_model_is_public(model_slug));
create policy provider_catalog_public_guard on public.v2_subscription_plan_models
as restrictive for select to anon, authenticated using (public.catalog_model_is_public(model_slug));
