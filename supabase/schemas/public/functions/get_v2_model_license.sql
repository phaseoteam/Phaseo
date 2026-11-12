CREATE OR REPLACE FUNCTION public.get_v2_model_license (
  p_model_slug text
)
  RETURNS TABLE (
    model_slug  text,
    license     text,
    license_url text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select model.model_slug, model.license, model.license_url
  from public.v2_models model
  where model.model_slug = lower(trim(p_model_slug))
    and model.hidden = false
    and model.status <> 'disabled';
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_license"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_license"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_license"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_license"(text) TO "postgres";
