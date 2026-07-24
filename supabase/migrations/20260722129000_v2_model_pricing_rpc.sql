create or replace function public.get_v2_model_pricing(
  p_model_slug text,
  p_region text default null,
  p_service_tier text default null
)
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with eligible_variants as (
    select variant.variant_id, variant.provider_model_id, variant.service_tier_slug,
      variant.execution_region, variant.data_region
    from public.v2_route_variants variant
    where variant.status <> 'disabled'
      and (p_region is null or lower(p_region) = lower(coalesce(variant.execution_region, ''))
        or lower(p_region) = lower(coalesce(variant.data_region, '')))
      and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
  ),
  provider_models as (
    select
      route.provider_slug,
      provider.name as provider_name,
      provider.status as provider_status,
      provider.routing_enabled as provider_routing_enabled,
      route.provider_model_id,
      route.model_slug,
      route.provider_model_slug,
      route.status as route_status,
      route.routing_enabled as route_routing_enabled,
      route.input_modalities,
      route.output_modalities,
      route.context_length,
      route.max_output_tokens,
      variant.variant_id,
      variant.service_tier_slug,
      variant.execution_region,
      variant.data_region,
      capability.capability_id,
      capability.status as capability_status,
      capability.params,
      capability.max_input_tokens,
      capability.max_output_tokens as capability_max_output_tokens
    from public.v2_model_provider_routes route
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    join eligible_variants variant on variant.provider_model_id = route.provider_model_id
    left join public.v2_route_capabilities capability on capability.provider_model_id = route.provider_model_id
    where route.model_slug = lower(trim(p_model_slug))
      and route.status <> 'disabled'
      and provider.status <> 'disabled'
  ),
  grouped as (
    select
      model.provider_slug,
      max(model.provider_name) as provider_name,
      max(model.provider_status) as provider_status,
      bool_or(model.provider_routing_enabled) as provider_routing_enabled,
      jsonb_agg(distinct jsonb_build_object(
        'id', model.provider_model_id,
        'api_provider_id', model.provider_slug,
        'provider_model_slug', model.provider_model_slug,
        'model_id', model.model_slug,
        'endpoint', coalesce(model.capability_id, 'unmapped'),
        'capability_status', model.capability_status,
        'routing_status', model.route_status,
        'is_active_gateway', model.route_status = 'active' and model.route_routing_enabled and model.provider_routing_enabled,
        'input_modalities', array_to_string(model.input_modalities, ','),
        'output_modalities', array_to_string(model.output_modalities, ','),
        'context_length', model.context_length,
        'max_input_tokens', model.max_input_tokens,
        'max_output_tokens', coalesce(model.capability_max_output_tokens, model.max_output_tokens),
        'params', model.params,
        'service_tier', model.service_tier_slug,
        'execution_region', model.execution_region,
        'data_region', model.data_region
      )) as provider_models,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sku.sku_id,
          'model_key', model.provider_slug || ':' || route.model_slug || ':' || sku.operation,
          'capability_id', sku.operation,
          'pricing_plan', sku.service_tier_slug,
          'meter', meter.meter_key,
          'unit', meter.unit,
          'unit_size', meter.unit_quantity,
          'price_per_unit', meter.price_nanos / 1000000000.0,
          'currency', sku.currency,
          'priority', meter.meter_order,
          'effective_from', sku.effective_from,
          'effective_to', sku.effective_to,
          'note', sku.description,
          'match', coalesce(sku.metadata->'match', '[]'::jsonb)
        ) order by meter.meter_order, meter.meter_key)
        from public.v2_pricing_skus sku
        join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id
        join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id
        where route.model_slug = lower(trim(p_model_slug))
          and sku.provider_model_id in (select provider_model_id from provider_models where provider_slug = model.provider_slug)
          and sku.status <> 'disabled'
          and sku.effective_from <= now()
          and (sku.effective_to is null or sku.effective_to > now())
          and (p_service_tier is null or sku.service_tier_slug = lower(p_service_tier))
      ), '[]'::jsonb) as pricing_rules
    from provider_models model
    group by model.provider_slug
  )
  select jsonb_build_object(
    'provider', jsonb_build_object(
      'api_provider_id', grouped.provider_slug,
      'api_provider_name', grouped.provider_name,
      'status', grouped.provider_status,
      'routing_status', case when grouped.provider_routing_enabled then 'active' else 'disabled' end
    ),
    'provider_models', grouped.provider_models,
    'pricing_rules', grouped.pricing_rules
  )
  from grouped
  order by grouped.provider_name;
$$;

grant execute on function public.get_v2_model_pricing(text, text, text) to anon, authenticated, service_role;
