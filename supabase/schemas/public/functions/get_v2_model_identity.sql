CREATE OR REPLACE FUNCTION public.get_v2_model_identity (
  p_model_slug text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select jsonb_build_object(
    'model_slug', model.model_slug,
    'name', model.name,
    'description', model.description,
    'status', model.status,
    'catalogue_status', model.catalogue_status,
    'hidden', model.hidden,
    'previous_model_slug', model.previous_model_slug,
    'replacement_model_slug', model.replacement_model_slug,
    'announced_at', model.announced_at,
    'released_at', model.released_at,
    'deprecated_at', model.deprecated_at,
    'retired_at', model.retired_at,
    'removal_date', model.removal_date,
    'family_slug', model.family_slug,
    'license', model.license,
    'license_url', model.license_url,
    'lab_slug', lab.lab_slug,
    'lab_name', lab.name,
    'lab_country_code', lab.country_code
  )
  from public.v2_models model
  join public.v2_labs lab on lab.lab_slug = model.lab_slug
  where model.model_slug = lower(trim(p_model_slug))
    and model.hidden = false
    and model.status <> 'disabled';
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_identity"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_identity"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_identity"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_identity"(text) TO "postgres";
