-- Importer helper: keep derived route-variant links current after JSON data changes.
-- The catalogue remains authored in JSON; this function only refreshes the
-- denormalized lookup key used by public pricing RPCs.
create or replace function public.refresh_v2_pricing_variant_links()
returns integer
language sql
security definer
set search_path = public
as $$
  with updated as (
    update public.v2_pricing_skus sku
    set route_variant_id = variant.variant_id,
        updated_at = now()
    from public.v2_route_variants variant
    where variant.provider_model_id = sku.provider_model_id
      and variant.service_tier_slug = coalesce(sku.service_tier_slug, 'standard')
      and variant.variant_key = 'global:' || coalesce(sku.service_tier_slug, 'standard')
      and sku.route_variant_id is distinct from variant.variant_id
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke all on function public.refresh_v2_pricing_variant_links() from public, anon, authenticated;
grant execute on function public.refresh_v2_pricing_variant_links() to service_role;
