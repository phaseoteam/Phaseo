-- Restored from Phaseo Prod migration records; already applied as version 20261011195528.
-- phaseo:allow-production-history-backfill reason: Record the model row lab colour change that was applied to production directly, so the recorded version matches without replaying it there.
CREATE OR REPLACE FUNCTION public.get_public_models_page_rows()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      'status', case
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'rumoured' then 'Rumoured'
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'announced' then 'Announced'
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'preview' then 'Preview'
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'available' then 'Available'
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'limited_access' then 'Limited Access'
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'deprecated' then 'Deprecated'
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'retired' then 'Retired'
        when lower(coalesce(nullif(model.catalogue_status, 'unknown'), model.status, '')) = 'withheld' then 'Withheld'
        else null
      end,
      'deprecation_date', model.deprecated_at,
      'retirement_date', model.retired_at,
      'removal_date', model.removal_date,
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
  )
  select rows.payload || jsonb_build_object('organisation_colour',
    coalesce(nullif(lab.colour, ''), nullif(lab.metadata->>'colour', '')))
  from (
    select payload from routed
    union all
    select payload from catalogue_only
  ) rows
  left join public.v2_labs lab on lab.lab_slug = rows.payload->>'organisation_id'
  order by
    rows.payload->>'primary_timestamp' desc nulls last,
    rows.payload->>'organisation_name',
    rows.payload->>'name';
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_public_models_page_rows(p_region text DEFAULT NULL::text, p_service_tier text DEFAULT 'standard'::text)
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  with pages as (
    select page.payload
    from public.get_v2_public_models_page_rows_without_stealth_redaction(
      p_region,
      p_service_tier
    ) as page(payload)
  ), redacted as (
    select
      pages.payload,
      coalesce(details.items, '[]'::jsonb) as provider_details
    from pages
    left join lateral (
      select jsonb_agg(distinct case
        when exists (
          select 1
          from public.v2_model_provider_routes route
          where route.is_stealth = true
            and route.model_slug = pages.payload->>'model_id'
            and route.provider_slug = detail.item->>'id'
            and coalesce(route.provider_model_slug, '') = coalesce(detail.item->>'provider_model_slug', '')
        ) then detail.item || jsonb_build_object(
          'id', 'stealth',
          'name', 'stealth',
          'provider_model_slug', pages.payload->>'model_id',
          'execution_region', null,
          'data_region', null
        )
        else detail.item
      end) as items
      from jsonb_array_elements(
        coalesce(pages.payload->'gateway_provider_details', '[]'::jsonb)
      ) as detail(item)
    ) details on true
  )
  select redacted.payload || jsonb_build_object(
    'organisation_colour', coalesce(nullif(lab.colour, ''), nullif(lab.metadata->>'colour', '')),
    'gateway_provider_details', redacted.provider_details,
    'gateway_provider_names', coalesce((
      select to_jsonb(array_agg(distinct item->>'name' order by item->>'name'))
      from jsonb_array_elements(redacted.provider_details) as detail(item)
      where nullif(item->>'name', '') is not null
    ), '[]'::jsonb),
    'gateway_active_provider_names', coalesce((
      select to_jsonb(array_agg(distinct item->>'name' order by item->>'name'))
      from jsonb_array_elements(redacted.provider_details) as detail(item)
      where item->>'is_active' = 'true'
        and nullif(item->>'name', '') is not null
    ), '[]'::jsonb),
    'gateway_api_model_ids', coalesce((
      select to_jsonb(array_agg(distinct item->>'provider_model_slug' order by item->>'provider_model_slug'))
      from jsonb_array_elements(redacted.provider_details) as detail(item)
      where nullif(item->>'provider_model_slug', '') is not null
    ), '[]'::jsonb),
    'gateway_execution_regions', coalesce((
      select to_jsonb(array_agg(
        distinct lower(coalesce(nullif(item->>'execution_region', ''), nullif(item->>'data_region', '')))
        order by lower(coalesce(nullif(item->>'execution_region', ''), nullif(item->>'data_region', '')))
      ))
      from jsonb_array_elements(redacted.provider_details) as detail(item)
      where coalesce(nullif(item->>'execution_region', ''), nullif(item->>'data_region', '')) is not null
    ), '[]'::jsonb),
    'gateway_provider_count', coalesce((
      select count(distinct item->>'id')
      from jsonb_array_elements(redacted.provider_details) as detail(item)
      where nullif(item->>'id', '') is not null
    ), 0),
    'gateway_active_provider_count', coalesce((
      select count(distinct item->>'id')
      from jsonb_array_elements(redacted.provider_details) as detail(item)
      where item->>'is_active' = 'true'
        and nullif(item->>'id', '') is not null
    ), 0)
  )
  from redacted
  left join public.v2_labs lab on lab.lab_slug = redacted.payload->>'organisation_id';
$function$;
