CREATE OR REPLACE FUNCTION public.get_v2_model_performance_colos (
  p_model_slug text
)
  RETURNS TABLE (
    cloudflare_colo text,
    request_count   bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
select colos.*
from public.v2_models model
cross join lateral public.get_v2_model_performance_colos_unfiltered(model.model_slug) colos
where model.model_slug = lower(trim(p_model_slug))
  and model.hidden = false
  and model.status <> 'disabled'
  and colos.request_count >= 1;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_colos"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_colos"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_colos"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_colos"(text) FROM PUBLIC, "anon", "authenticated";
