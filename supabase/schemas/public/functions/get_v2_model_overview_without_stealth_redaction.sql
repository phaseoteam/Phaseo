CREATE OR REPLACE FUNCTION public.get_v2_model_overview_without_stealth_redaction (
  p_model_slug   text,
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with routed_model as (
    select page.payload
    from public.get_v2_public_models_page_rows(p_region, coalesce(p_service_tier, 'standard')) as page(payload)
    where page.payload->>'model_id' = lower(p_model_slug)
    limit 1
  ),
  catalogue_model as (
    select jsonb_build_object(
      'model_id', model.model_slug,
      'name', model.name,
      'description', model.description,
      'organisation_id', model.lab_slug,
      'organisation_name', lab.name,
      'primary_date', coalesce(model.released_at, model.announced_at),
      'primary_timestamp', extract(epoch from coalesce(model.released_at, model.announced_at)) * 1000,
      'primary_group_key', to_char(coalesce(model.released_at, model.announced_at), 'YYYY-MM'),
      'gateway_status', case
        when lower(coalesce(model.catalogue_status, model.status, '')) in ('draft', 'announced') then 'coming_soon'
        else 'not_active'
      end,
      'gateway_provider_count', 0,
      'gateway_active_provider_count', 0,
      'gateway_endpoints', array[]::text[],
      'gateway_input_modalities', coalesce(model.input_modalities, array[]::text[]),
      'gateway_output_modalities', coalesce(model.output_modalities, array[]::text[]),
      'gateway_features', array[]::text[],
      'gateway_tiers', array[]::text[],
      'gateway_provider_names', array[]::text[],
      'gateway_active_provider_names', array[]::text[],
      'gateway_execution_regions', array[]::text[],
      'gateway_provider_details', '[]'::jsonb,
      'gateway_api_model_ids', array[]::text[],
      'context_lengths', case
        when jsonb_typeof(model.metadata->'limits'->'context') = 'number'
          then jsonb_build_array((model.metadata->'limits'->>'context')::integer)
        else '[]'::jsonb
      end,
      'supported_parameters', array[]::text[],
      'lowest_input_price', null,
      'lowest_output_price', null,
      'lowest_standard_input_price', null,
      'lowest_standard_output_price', null,
      'lowest_from_price', null,
      'pricing_detail_rows', '[]'::jsonb,
      'gateway_monitor_rows', '[]'::jsonb,
      'popularity_tokens_week', null,
      'throughput_week', null,
      'latency_week', null
    ) as payload
    from public.v2_models model
    join public.v2_labs lab on lab.lab_slug = model.lab_slug
    where model.model_slug = lower(p_model_slug)
      and model.hidden = false
      and model.status <> 'disabled'
      and not exists (
        select 1
        from public.v2_model_provider_routes route
        join public.v2_providers provider on provider.provider_slug = route.provider_slug
        join public.v2_route_variants variant on variant.provider_model_id = route.provider_model_id
        where route.model_slug = model.model_slug
          and route.status in ('active', 'degraded')
          and route.routing_enabled = true
          and provider.status <> 'disabled'
          and provider.routing_enabled = true
          and variant.status in ('active', 'degraded')
          and variant.routing_enabled = true
      )
    limit 1
  )
  select case
    when not exists (select 1 from routed_model)
      and not exists (select 1 from catalogue_model)
      then '{}'::jsonb
    else coalesce(
      (select payload from routed_model),
      (select payload from catalogue_model)
    ) || jsonb_build_object(
    'routes', coalesce((
      select jsonb_agg(to_jsonb(route_row) order by route_row.provider_name, route_row.variant_key)
      from (
        select
          variant.variant_id,
          variant.provider_model_id,
          route.provider_slug,
          provider.name as provider_name,
          route.provider_model_slug,
          variant.variant_key,
          variant.service_tier_slug,
          variant.execution_region,
          variant.data_region,
          variant.status,
          variant.routing_enabled,
          route.status as route_status,
          provider.status as provider_status,
          provider.routing_enabled as provider_routing_enabled
        from public.v2_route_variants variant
        join public.v2_model_provider_routes route on route.provider_model_id = variant.provider_model_id
        join public.v2_providers provider on provider.provider_slug = route.provider_slug
        where route.model_slug = lower(p_model_slug)
          and variant.status <> 'disabled'
          and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
          and (p_region is null or lower(p_region) = lower(coalesce(variant.execution_region, '')) or lower(p_region) = lower(coalesce(variant.data_region, '')))
      ) route_row
    ), '[]'::jsonb),
    'service_tiers', coalesce((
      select jsonb_agg(distinct variant.service_tier_slug order by variant.service_tier_slug)
      from public.v2_route_variants variant
      join public.v2_model_provider_routes route on route.provider_model_id = variant.provider_model_id
      where route.model_slug = lower(p_model_slug) and variant.status <> 'disabled'
    ), '[]'::jsonb),
    'regions', coalesce((
      select jsonb_agg(distinct region order by region)
      from public.v2_route_variants variant
      join public.v2_model_provider_routes route on route.provider_model_id = variant.provider_model_id
      cross join lateral (values (variant.execution_region), (variant.data_region)) regions(region)
      where route.model_slug = lower(p_model_slug) and region is not null
    ), '[]'::jsonb)
    )
  end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_overview_without_stealth_redaction"(text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_overview_without_stealth_redaction"(text, text, text) IS 'Returns stable catalogue facts for visible models, including models without active provider routes, plus any available route metadata.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_overview_without_stealth_redaction"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_overview_without_stealth_redaction"(text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_overview_without_stealth_redaction"(text, text, text) FROM PUBLIC, "anon", "authenticated";
