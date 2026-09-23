-- Prefer an exact variant lifecycle record before falling back to its base
-- model, so retired offers such as `:free` cannot inherit an active status.
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

grant execute on function public.get_v2_public_models_page_rows(text, text)
  to anon, authenticated, service_role;

comment on function public.get_v2_public_models_page_rows(text, text) is
  'SQL-owned public model catalogue projection with exact-variant lifecycle fields and base-model fallback.';

update public.v2_model_provider_routes
set status = 'retired',
    routing_enabled = false,
    provider_availability_status = 'removed',
    phaseo_status = 'disabled',
    effective_to = coalesce(effective_to, '2026-09-07T00:00:00Z'::timestamptz),
    updated_at = now()
where model_slug = 'minimax/minimax-m3:free';
