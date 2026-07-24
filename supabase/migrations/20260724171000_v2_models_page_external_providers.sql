-- Include catalogue-only external providers in the fast /models projection.
-- They are display metadata only: active counts, pricing, regions, and routing
-- eligibility continue to come exclusively from routable provider routes.

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
      and not exists (
        select 1
        from routed
        where routed.payload->>'model_id' = model.model_slug
      )
  ),
  all_rows as materialized (
    select payload from routed
    union all
    select payload from catalogue_only
  ),
  external_providers as (
    select
      route.model_slug,
      count(*)::integer as provider_count,
      array_agg(route.provider_name order by route.provider_name) as provider_names,
      jsonb_agg(
        jsonb_build_object(
          'id', route.provider_slug,
          'name', route.provider_name,
          'status', 'external',
          'is_active', false
        )
        order by route.provider_name
      ) as provider_details
    from (
      select distinct
        model_route.model_slug,
        provider.provider_slug,
        provider.name as provider_name
      from public.v2_model_provider_routes model_route
      join public.v2_providers provider
        on provider.provider_slug = model_route.provider_slug
      where provider.status = 'external'
        and model_route.status <> 'retired'
    ) route
    group by route.model_slug
  )
  select
    case
      when external.model_slug is null then rows.payload
      else jsonb_set(
        jsonb_set(
          jsonb_set(
            rows.payload,
            '{gateway_provider_count}',
            to_jsonb(
              coalesce((rows.payload->>'gateway_provider_count')::integer, 0)
              + external.provider_count
            )
          ),
          '{gateway_provider_names}',
          coalesce(
            (
              select jsonb_agg(provider_name order by provider_name)
              from (
                select jsonb_array_elements_text(
                  coalesce(rows.payload->'gateway_provider_names', '[]'::jsonb)
                ) as provider_name
                union
                select unnest(external.provider_names) as provider_name
              ) names
            ),
            '[]'::jsonb
          )
        ),
        '{gateway_provider_details}',
        coalesce(rows.payload->'gateway_provider_details', '[]'::jsonb)
          || external.provider_details
      )
    end
  from all_rows rows
  left join external_providers external
    on external.model_slug = rows.payload->>'model_id'
  order by
    rows.payload->>'primary_timestamp' desc nulls last,
    rows.payload->>'organisation_name',
    rows.payload->>'name';
$$;

grant execute on function public.get_public_models_page_rows()
  to anon, authenticated, service_role;
