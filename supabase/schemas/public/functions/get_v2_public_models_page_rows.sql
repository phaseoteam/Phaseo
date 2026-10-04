CREATE OR REPLACE FUNCTION public.get_v2_public_models_page_rows (
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT 'standard'::text
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_models_page_rows"(text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_public_models_page_rows"(text, text) IS 'Service-only public model catalogue projection with stealth redaction and exact-variant lifecycle fields.';

REVOKE ALL ON FUNCTION "public"."get_v2_public_models_page_rows"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_models_page_rows"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_public_models_page_rows"(text, text) FROM PUBLIC, "anon", "authenticated";
