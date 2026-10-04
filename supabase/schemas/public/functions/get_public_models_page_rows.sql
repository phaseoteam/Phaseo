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
  select rows.payload
  from (
    select payload from routed
    union all
    select payload from catalogue_only
  ) rows
  order by
    rows.payload->>'primary_timestamp' desc nulls last,
    rows.payload->>'organisation_name',
    rows.payload->>'name';
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_models_page_rows"() TO "service_role";

COMMENT ON FUNCTION "public"."get_public_models_page_rows"() IS 'SQL-owned public model catalogue projection with route metadata and model lifecycle fields.';

REVOKE ALL ON FUNCTION "public"."get_public_models_page_rows"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_models_page_rows"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_models_page_rows"() FROM PUBLIC, "anon", "authenticated";
