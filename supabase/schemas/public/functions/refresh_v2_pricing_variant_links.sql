CREATE OR REPLACE FUNCTION public.refresh_v2_pricing_variant_links()
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_v2_pricing_variant_links"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_v2_pricing_variant_links"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_v2_pricing_variant_links"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_v2_pricing_variant_links"() FROM PUBLIC, "anon", "authenticated";
