-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

set local lock_timeout='5s';
-- Aggregate capabilities once per model instead of rescanning eligible routes
-- for every catalogue row. Preserve the existing RPC signature and privileges.
CREATE OR REPLACE FUNCTION public.get_v2_public_models_page_rows_without_lifecycle(p_region text DEFAULT NULL::text, p_service_tier text DEFAULT 'standard'::text)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with candidate_routes as (
    select
      route.provider_model_id,
      route.model_slug,
      route.provider_slug,
      route.provider_model_slug,
      route.input_modalities,
      route.output_modalities,
      route.context_length,
      route.max_output_tokens,
      route.status as route_status,
      route.routing_enabled as route_routing_enabled,
      route.provider_availability_status,
      model.name,
      model.description,
      model.status as model_status,
      model.hidden,
      model.announced_at,
      model.released_at,
      model.input_modalities as model_input_modalities,
      model.output_modalities as model_output_modalities,
      model.lab_slug,
      lab.name as lab_name,
      provider.name as provider_name,
      provider.status as provider_status,
      provider.routing_enabled as provider_routing_enabled,
      variant.service_tier_slug,
      variant.execution_region,
      variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      region.region_code
    from public.v2_model_provider_routes route
    join public.v2_models model on model.model_slug = route.model_slug
    join public.v2_labs lab on lab.lab_slug = model.lab_slug
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    join public.v2_route_variants variant on variant.provider_model_id = route.provider_model_id
    left join public.v2_provider_regions region
      on region.provider_slug = route.provider_slug
     and region.status <> 'disabled'
     and region.routing_enabled = true
    where model.hidden = false
      and model.status <> 'disabled'
      and provider.status <> 'disabled'
      and route.status in ('active', 'degraded')
      and variant.status in ('active', 'degraded')
      and provider.routing_enabled = true
      and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
      and (
        p_region is null
        or lower(p_region) = lower(coalesce(variant.execution_region, ''))
        or lower(p_region) = lower(coalesce(variant.data_region, ''))
        or lower(p_region) = lower(coalesce(region.region_code, ''))
        or lower(p_region) = any(route.regions)
      )
  ),
  eligible_routes as (
    select *
    from candidate_routes
    where route_routing_enabled = true
      and provider_routing_enabled = true
      and variant_routing_enabled = true
  ),
  preview_routes as (
    select *
    from candidate_routes
    where route_routing_enabled = false
      and variant_routing_enabled = false
      and provider_availability_status = 'coming_soon'
  ),
  display_routes as (
    select * from eligible_routes
    union all
    select * from preview_routes
  ),
  capability_rows as (
    select
      capability.provider_model_id,
      array_agg(distinct capability.capability_id order by capability.capability_id)
        filter (where capability.status <> 'disabled') as capabilities,
      array_agg(distinct parameter.key order by parameter.key)
        filter (where parameter.key is not null) as supported_parameters
    from public.v2_route_capabilities capability
    left join lateral jsonb_object_keys(
      case when jsonb_typeof(capability.params) = 'object' then capability.params else '{}'::jsonb end
    ) parameter(key) on true
    where capability.status <> 'disabled'
    group by capability.provider_model_id
  ),
  route_modalities as (
    select
      route.model_slug,
      array_agg(distinct input_modality order by input_modality) filter (where input_modality is not null and input_modality <> '') as input_modalities,
      array_agg(distinct output_modality order by output_modality) filter (where output_modality is not null and output_modality <> '') as output_modalities
    from eligible_routes route
    left join lateral unnest(route.input_modalities) input(input_modality) on true
    left join lateral unnest(route.output_modalities) output(output_modality) on true
    group by route.model_slug
  ),
  pricing_rows as (
    select
      route.model_slug,
      min(meter.price_nanos / 1000000000.0) filter (where meter.direction = 'input') as lowest_input_price,
      min(meter.price_nanos / 1000000000.0) filter (where meter.direction = 'output') as lowest_output_price,
      jsonb_agg(
        jsonb_build_object(
          'label', meter.display_label,
          'meter_key', meter.meter_key,
          'unit', meter.unit,
          'unit_quantity', meter.unit_quantity,
          'price', meter.price_nanos / 1000000000.0,
          'display_unit', meter.display_unit,
          'service_tier', sku.service_tier_slug
        )
        order by meter.meter_order, meter.meter_key
      ) as pricing_detail_rows
    from public.v2_pricing_skus sku
    join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id and meter.billable
    join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id
    where sku.status <> 'disabled'
      and (p_service_tier is null or sku.service_tier_slug = lower(p_service_tier))
      and sku.effective_from <= now()
      and (sku.effective_to is null or sku.effective_to > now())
    group by route.model_slug
  ),
  capability_summary as (
    select
      eligible.model_slug,
      array_agg(distinct capability_id order by capability_id) as capabilities,
      array_agg(distinct case
        when capability_id ilike '%tool%' then 'tools'
        when capability_id ilike '%structured%' then 'structured_outputs'
        when capability_id ilike '%reason%' or capability_id ilike '%thinking%' then 'reasoning'
        when capability_id ilike '%search%' then 'web_search'
        else null
      end order by case
        when capability_id ilike '%tool%' then 'tools'
        when capability_id ilike '%structured%' then 'structured_outputs'
        when capability_id ilike '%reason%' or capability_id ilike '%thinking%' then 'reasoning'
        when capability_id ilike '%search%' then 'web_search'
        else null
      end) filter (where capability_id is not null) as features,
      array_agg(distinct parameter order by parameter) filter (where parameter is not null) as supported_parameters
    from eligible_routes eligible
    join public.v2_route_capabilities capability on capability.provider_model_id = eligible.provider_model_id
    left join lateral jsonb_object_keys(
      case when jsonb_typeof(capability.params) = 'object' then capability.params else '{}'::jsonb end
    ) parameter on true
    where capability.status <> 'disabled'
    group by eligible.model_slug
  ),
  grouped as (
    select
      route.model_slug,
      max(route.name) as name,
      max(route.description) as description,
      max(route.model_status) as model_status,
      bool_or(route.hidden) as hidden,
      max(route.announced_at) as announced_at,
      max(route.released_at) as released_at,
      max(route.lab_slug) as lab_slug,
      max(route.lab_name) as lab_name,
      count(distinct route.provider_model_id)::integer as provider_count,
      count(distinct route.provider_model_id) filter (
        where route.route_status = 'active'
          and route.route_routing_enabled
          and route.provider_status not in ('disabled', 'deprecated')
          and route.provider_routing_enabled
          and route.variant_routing_enabled
      )::integer as active_provider_count,
      count(distinct route.provider_model_id) filter (
        where route.provider_availability_status = 'coming_soon'
          and not route.route_routing_enabled
          and not route.variant_routing_enabled
      )::integer as coming_soon_provider_count,
      array_agg(distinct route.provider_slug order by route.provider_slug) as provider_ids,
      array_agg(distinct route.provider_name order by route.provider_name) as provider_names,
      array_agg(distinct route.provider_name order by route.provider_name) filter (
        where route.route_status = 'active'
          and route.route_routing_enabled
          and route.provider_routing_enabled
          and route.variant_routing_enabled
      ) as active_provider_names,
      array_agg(distinct route.provider_model_slug order by route.provider_model_slug) as provider_model_slugs,
      array_agg(distinct route.service_tier_slug order by route.service_tier_slug) as service_tiers,
      array_agg(distinct nullif(lower(coalesce(route.execution_region, route.data_region, route.region_code)), '') order by nullif(lower(coalesce(route.execution_region, route.data_region, route.region_code)), '')) filter (where nullif(lower(coalesce(route.execution_region, route.data_region, route.region_code)), '') is not null) as regions,
      array_agg(distinct route.context_length order by route.context_length) filter (where route.context_length is not null) as context_lengths,
      jsonb_agg(distinct jsonb_build_object(
        'id', route.provider_slug,
        'name', route.provider_name,
        'provider_model_slug', route.provider_model_slug,
        'service_tier', route.service_tier_slug,
        'execution_region', route.execution_region,
        'data_region', route.data_region,
        'is_active', route.route_status = 'active' and route.route_routing_enabled and route.provider_routing_enabled and route.variant_routing_enabled,
        'status', case
          when route.provider_availability_status = 'coming_soon' then 'coming_soon'
          when route.route_status = 'active' and route.route_routing_enabled and route.provider_routing_enabled and route.variant_routing_enabled then 'active'
          else 'inactive'
        end
      )) as provider_details
    from display_routes route
    group by route.model_slug
  )
  select jsonb_build_object(
    'model_id', grouped.model_slug,
    'name', grouped.name,
    'description', grouped.description,
    'organisation_id', grouped.lab_slug,
    'organisation_name', grouped.lab_name,
    'primary_date', coalesce(grouped.released_at, grouped.announced_at),
    'primary_timestamp', extract(epoch from coalesce(grouped.released_at, grouped.announced_at)) * 1000,
    'primary_group_key', to_char(coalesce(grouped.released_at, grouped.announced_at), 'YYYY-MM'),
    'gateway_status', case
      when grouped.active_provider_count > 0 then 'active'
      when grouped.coming_soon_provider_count > 0 then 'coming_soon'
      when lower(coalesce(grouped.model_status, '')) = 'draft' then 'coming_soon'
      else 'not_active'
    end,
    'gateway_provider_count', grouped.provider_count,
    'gateway_active_provider_count', grouped.active_provider_count,
    'gateway_endpoints', coalesce(capability_summary.capabilities, array[]::text[]),
    'gateway_input_modalities', coalesce(modalities.input_modalities, array[]::text[]),
    'gateway_output_modalities', coalesce(modalities.output_modalities, array[]::text[]),
    'gateway_features', coalesce(capability_summary.features, array[]::text[]),
    'gateway_tiers', coalesce(grouped.service_tiers, array[]::text[]),
    'gateway_provider_names', coalesce(grouped.provider_names, array[]::text[]),
    'gateway_active_provider_names', coalesce(grouped.active_provider_names, array[]::text[]),
    'gateway_execution_regions', coalesce(grouped.regions, array[]::text[]),
    'gateway_provider_details', coalesce(grouped.provider_details, '[]'::jsonb),
    'gateway_api_model_ids', coalesce(grouped.provider_model_slugs, array[]::text[]),
    'context_lengths', coalesce(grouped.context_lengths, array[]::integer[]),
    'supported_parameters', coalesce(capability_summary.supported_parameters, array[]::text[]),
    'lowest_input_price', pricing.lowest_input_price,
    'lowest_output_price', pricing.lowest_output_price,
    'lowest_standard_input_price', pricing.lowest_input_price,
    'lowest_standard_output_price', pricing.lowest_output_price,
    'lowest_standard_input_price_label', 'Input',
    'lowest_standard_input_price_unit', 'billing unit',
    'lowest_standard_output_price_label', 'Output',
    'lowest_standard_output_price_unit', 'billing unit',
    'lowest_from_price', least(pricing.lowest_input_price, pricing.lowest_output_price),
    'lowest_from_price_unit', 'billing unit',
    'pricing_detail_rows', coalesce(pricing.pricing_detail_rows, '[]'::jsonb),
    'gateway_monitor_rows', '[]'::jsonb,
    'popularity_tokens_week', null,
    'throughput_week', null,
    'latency_week', null
  )
  from grouped
  left join route_modalities modalities on modalities.model_slug = grouped.model_slug
  left join pricing_rows pricing on pricing.model_slug = grouped.model_slug
  left join capability_summary on capability_summary.model_slug = grouped.model_slug
  order by grouped.released_at desc nulls last, grouped.lab_name, grouped.name;
$function$;

