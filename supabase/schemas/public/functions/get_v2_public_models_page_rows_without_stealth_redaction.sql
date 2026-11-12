CREATE OR REPLACE FUNCTION public.get_v2_public_models_page_rows_without_stealth_redaction (
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT 'standard'::text
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_models_page_rows_without_stealth_redaction"(text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_public_models_page_rows_without_stealth_redaction"(text, text) IS 'SQL-owned public model catalogue projection with route metadata and model lifecycle fields.';

REVOKE ALL ON FUNCTION "public"."get_v2_public_models_page_rows_without_stealth_redaction"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_models_page_rows_without_stealth_redaction"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_public_models_page_rows_without_stealth_redaction"(text, text) FROM PUBLIC, "anon", "authenticated";
