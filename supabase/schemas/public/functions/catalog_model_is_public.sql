CREATE OR REPLACE FUNCTION public.catalog_model_is_public (
  p_model_slug text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.v2_models m
    where m.model_slug = p_model_slug and m.hidden = false
      and m.status not in ('disabled', 'not_ready', 'coming_soon', 'testing', 'draft', 'pending')
      and (m.released_at is null or m.released_at <= now())
      and not exists (select 1 from public.v2_model_provider_routes r where r.model_slug = m.model_slug and r.is_stealth)
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."catalog_model_is_public"(text) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."catalog_model_is_public"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."catalog_model_is_public"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."catalog_model_is_public"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."catalog_model_is_public"(text) TO "postgres";
