SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_public_models_page_payload (
  p_region          text DEFAULT NULL::text,
  p_service_tier    text DEFAULT NULL::text,
  p_organisation_id text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  SET work_mem TO '16MB'
  AS $function$
  select case when p_region is null and p_service_tier is null then (
    select coalesce(
      jsonb_agg(
        payload order by
          nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
          model.created_at desc nulls last,
          position
      ),
      '[]'::jsonb
    )
    from public.get_public_models_page_rows() with ordinality as rows(payload, position)
    left join public.v2_models model on model.model_slug = payload->>'model_id'
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) else (
    select coalesce(
      jsonb_agg(
        payload order by
          nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
          model.created_at desc nulls last,
          position
      ),
      '[]'::jsonb
    )
    from public.get_v2_public_models_page_rows(p_region, p_service_tier)
      with ordinality as rows(payload, position)
    left join public.v2_models model on model.model_slug = payload->>'model_id'
    where p_organisation_id is null or payload->>'organisation_id' = p_organisation_id
  ) end;
$function$;
