CREATE OR REPLACE FUNCTION public.get_v2_model_variants (
  p_model_slug text
)
  RETURNS TABLE (
    model_id     text,
    name         text,
    variant_kind text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with requested as (
    select coalesce(model.base_model_slug, model.model_slug) as base_model_slug
    from public.v2_models model
    where model.model_slug = lower(trim(p_model_slug))
      and model.hidden = false
      and model.status <> 'disabled'
  )
  select
    model.model_slug as model_id,
    model.name,
    model.variant_kind
  from public.v2_models model
  cross join requested
  where (
      model.model_slug = requested.base_model_slug
      or model.base_model_slug = requested.base_model_slug
    )
    and model.hidden = false
    and model.status <> 'disabled'
  order by
    case when model.variant_kind = 'standard' then 0 else 1 end,
    model.name,
    model.model_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_variants"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_variants"(text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_variants"(text) IS 'Returns the visible base/free sibling identities for a canonical V2 model slug.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_variants"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_variants"(text) TO "postgres";
