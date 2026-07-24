-- The public catalogue summary should expose every available service tier.
-- Pricing details still carry the tier on each meter row.

create or replace function public.get_public_models_page_rows()
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with routed as materialized (
    select payload
    from public.get_v2_public_models_page_rows(null, null) payload
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
      'pricing_detail_rows', '[]'::jsonb,
      'gateway_monitor_rows', '[]'::jsonb,
      'popularity_tokens_week', null,
      'throughput_week', null,
      'latency_week', null
    ) as payload
    from public.v2_models model
    join public.v2_labs lab on lab.lab_slug = model.lab_slug
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

create or replace function public.get_v2_provider_region_map(
  p_provider_slugs text[] default null
)
returns table (
  provider_slug text,
  regions text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    region.provider_slug,
    array_agg(distinct region.region_code order by region.region_code)
  from public.v2_provider_regions region
  where region.status <> 'disabled'
    and region.routing_enabled = true
    and (p_provider_slugs is null or region.provider_slug = any(p_provider_slugs))
  group by region.provider_slug;
$$;

grant execute on function public.get_v2_provider_region_map(text[]) to anon, authenticated, service_role;
