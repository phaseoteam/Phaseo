-- Include catalogue-only models in the compatibility RPC used by the Web API.

create or replace function public.get_public_models_page_rows()
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with routed as materialized (
    select payload
    from public.get_v2_public_models_page_rows(null, 'standard') payload
  ),
  catalogue_only as (
    select jsonb_build_object(
      'model_id', model.model_slug,
      'name', model.name,
      'description', model.description,
      'organisation_id', model.lab_slug,
      'organisation_name', lab.name,
      'primary_date', coalesce(model.released_at, model.announced_at),
      'primary_timestamp', extract(epoch from coalesce(model.released_at, model.announced_at)) * 1000,
      'primary_group_key', to_char(coalesce(model.released_at, model.announced_at), 'YYYY-MM'),
      'gateway_status', case when model.status = 'draft' then 'coming_soon' else 'not_active' end,
      'gateway_provider_count', 0,
      'gateway_active_provider_count', 0,
      'gateway_endpoints', array[]::text[],
      'gateway_input_modalities', model.input_modalities,
      'gateway_output_modalities', model.output_modalities,
      'gateway_features', array[]::text[],
      'gateway_tiers', array[]::text[],
      'gateway_provider_names', array[]::text[],
      'gateway_active_provider_names', array[]::text[],
      'gateway_execution_regions', array[]::text[],
      'gateway_provider_details', '[]'::jsonb,
      'gateway_api_model_ids', array[]::text[],
      'context_lengths', array[]::integer[],
      'supported_parameters', array[]::text[],
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
    ) as payload
    from public.v2_models model
    join public.v2_labs lab on lab.lab_slug = model.lab_slug
    left join lateral (
      select
        min(meter.price_nanos / 1000000000.0) filter (where meter.direction = 'input') as lowest_input_price,
        min(meter.price_nanos / 1000000000.0) filter (where meter.direction = 'output') as lowest_output_price,
        jsonb_agg(jsonb_build_object(
          'label', meter.display_label,
          'meter_key', meter.meter_key,
          'unit', meter.unit,
          'unit_quantity', meter.unit_quantity,
          'price', meter.price_nanos / 1000000000.0,
          'display_unit', meter.display_unit,
          'service_tier', sku.service_tier_slug
        ) order by meter.meter_order, meter.meter_key) as pricing_detail_rows
      from public.v2_pricing_skus sku
      join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id
      join public.v2_model_provider_routes route on route.provider_model_id = sku.provider_model_id
      where route.model_slug = model.model_slug
        and sku.service_tier_slug = 'standard'
        and sku.status <> 'disabled'
        and sku.effective_from <= now()
        and (sku.effective_to is null or sku.effective_to > now())
    ) pricing on true
    where model.hidden = false
      and model.status <> 'disabled'
      and not exists (select 1 from routed where routed.payload->>'model_id' = model.model_slug)
  )
  select all_rows.payload
  from (
    select payload from routed
    union all
    select payload from catalogue_only
  ) all_rows
  order by all_rows.payload->>'primary_timestamp' desc nulls last, all_rows.payload->>'organisation_name', all_rows.payload->>'name';
$$;

grant execute on function public.get_public_models_page_rows() to anon, authenticated, service_role;
