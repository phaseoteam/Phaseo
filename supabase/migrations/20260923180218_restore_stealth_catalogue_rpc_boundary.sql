-- Preserve exact variant lifecycle metadata inside the service-only raw
-- catalogue projection.
create or replace function public.get_v2_public_models_page_rows_without_stealth_redaction(
  p_region text default null,
  p_service_tier text default 'standard'
)
returns setof jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select
    page.payload || jsonb_build_object(
      'status', case
        when model.model_slug is null then null
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
      'removal_date', model.removal_date
    )
  from public.get_v2_public_models_page_rows_without_lifecycle(p_region, p_service_tier) as page(payload)
  left join lateral (
    select candidate.*
    from public.v2_models candidate
    where candidate.model_slug in (
      page.payload->>'model_id',
      case
        when page.payload->>'model_id' like '%:free'
          then left(page.payload->>'model_id', -5)
        else page.payload->>'model_id'
      end
    )
    order by (candidate.model_slug = page.payload->>'model_id') desc
    limit 1
  ) model on true;
$$;

revoke all on function public.get_v2_public_models_page_rows_without_stealth_redaction(text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_public_models_page_rows_without_stealth_redaction(text, text)
  to service_role;

-- Restore the security-definer redaction boundary that must remain in front of
-- the raw catalogue projection.
create or replace function public.get_v2_public_models_page_rows(
  p_region text default null,
  p_service_tier text default 'standard'
)
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
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
  from redacted;
$$;

revoke all on function public.get_v2_public_models_page_rows(text, text)
  from public, anon, authenticated;
grant execute on function public.get_v2_public_models_page_rows(text, text)
  to service_role;

comment on function public.get_v2_public_models_page_rows(text, text) is
  'Service-only public model catalogue projection with stealth redaction and exact-variant lifecycle fields.';
