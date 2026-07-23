-- v2 SQL-owned catalogue projections and routing RPCs.
-- The Worker calls these functions instead of repeating joins in TypeScript.

create or replace function public.get_v2_public_models_page_rows(
  p_region text default null,
  p_service_tier text default 'standard'
)
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with eligible_routes as (
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
      and route.routing_enabled = true
      and provider.routing_enabled = true
      and variant.status in ('active', 'degraded')
      and variant.routing_enabled = true
      and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
      and (
        p_region is null
        or lower(p_region) = lower(coalesce(variant.execution_region, ''))
        or lower(p_region) = lower(coalesce(variant.data_region, ''))
        or lower(p_region) = lower(coalesce(region.region_code, ''))
        or lower(p_region) = any(route.regions)
      )
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
    join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id
    join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id
    where sku.status <> 'disabled'
      and (p_service_tier is null or sku.service_tier_slug = lower(p_service_tier))
      and sku.effective_from <= now()
      and (sku.effective_to is null or sku.effective_to > now())
    group by route.model_slug
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
      )::integer as active_provider_count,
      array_agg(distinct route.provider_slug order by route.provider_slug) as provider_ids,
      array_agg(distinct route.provider_name order by route.provider_name) as provider_names,
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
        'is_active', route.route_status = 'active' and route.route_routing_enabled and route.provider_routing_enabled
      )) as provider_details
    from eligible_routes route
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
    'gateway_active_provider_names', coalesce(grouped.provider_names, array[]::text[]),
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
  left join lateral (
    select
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
    where eligible.model_slug = grouped.model_slug
      and capability.status <> 'disabled'
  ) capability_summary on true
  order by grouped.released_at desc nulls last, grouped.lab_name, grouped.name;
$$;

drop function if exists public.get_public_models_page_rows();
create or replace function public.get_public_models_page_rows()
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.get_v2_public_models_page_rows(null, 'standard');
$$;

create or replace function public.get_v2_model_overview(
  p_model_slug text,
  p_region text default null,
  p_service_tier text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce((
    select page.payload
    from public.get_v2_public_models_page_rows(p_region, coalesce(p_service_tier, 'standard')) as page(payload)
    where page.payload->>'model_id' = lower(p_model_slug)
    limit 1
  ), '{}'::jsonb)
  || jsonb_build_object(
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
  );
$$;

create or replace function public.get_v2_routing_candidates(
  p_model_slug text,
  p_capability_id text default null,
  p_region text default null,
  p_service_tier text default 'standard'
)
returns table (
  provider_model_id text,
  provider_slug text,
  provider_name text,
  model_slug text,
  provider_model_slug text,
  variant_id uuid,
  service_tier_slug text,
  execution_region text,
  data_region text,
  route_status text,
  provider_status text,
  capability_status text,
  routing_enabled boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    route.provider_model_id,
    route.provider_slug,
    provider.name,
    route.model_slug,
    route.provider_model_slug,
    variant.variant_id,
    variant.service_tier_slug,
    variant.execution_region,
    variant.data_region,
    route.status,
    provider.status,
    coalesce(capability.status, 'active'),
    route.routing_enabled and provider.routing_enabled and variant.routing_enabled
  from public.v2_model_provider_routes route
  join public.v2_providers provider on provider.provider_slug = route.provider_slug
  join public.v2_route_variants variant on variant.provider_model_id = route.provider_model_id
  left join lateral (
    select capability.status
    from public.v2_route_capabilities capability
    where capability.provider_model_id = route.provider_model_id
      and (p_capability_id is null or capability.capability_id = p_capability_id)
    order by case when capability.status = 'active' then 0 else 1 end, capability.capability_id
    limit 1
  ) capability on true
  where route.model_slug = lower(p_model_slug)
    and route.status in ('active', 'degraded')
    and provider.status not in ('disabled', 'deprecated')
    and variant.status in ('active', 'degraded')
    and (p_capability_id is null or capability.status = 'active')
    and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
    and (
      p_region is null
      or lower(p_region) = lower(coalesce(variant.execution_region, ''))
      or lower(p_region) = lower(coalesce(variant.data_region, ''))
    )
  order by (route.routing_enabled and provider.routing_enabled and variant.routing_enabled) desc,
    case route.status when 'active' then 0 else 1 end,
    provider.name,
    route.provider_model_id;
$$;

grant execute on function public.get_v2_public_models_page_rows(text, text) to anon, authenticated, service_role;
grant execute on function public.get_public_models_page_rows() to anon, authenticated, service_role;
grant execute on function public.get_v2_model_overview(text, text, text) to anon, authenticated, service_role;
grant execute on function public.get_v2_routing_candidates(text, text, text, text) to authenticated, service_role;

comment on function public.get_v2_public_models_page_rows(text, text) is 'SQL-owned public model catalogue projection with provider regions, capabilities, service tiers, and pricing summaries.';
comment on function public.get_v2_routing_candidates(text, text, text, text) is 'Internal routing candidate query with provider/model, region, tier, capability, and status gates evaluated in SQL.';
