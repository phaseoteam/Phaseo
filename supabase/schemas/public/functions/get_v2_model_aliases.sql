CREATE OR REPLACE FUNCTION public.get_v2_model_aliases (
  p_model_slug text
)
  RETURNS TABLE (
    alias_slug text,
    alias_type text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select alias.alias_slug, alias.alias_type
  from public.v2_model_aliases alias
  where alias.model_slug = lower(trim(p_model_slug))
    and alias.enabled = true
    and (alias.effective_from is null or alias.effective_from <= now())
    and (alias.effective_to is null or alias.effective_to > now())
  order by alias.alias_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_aliases"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_aliases"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_aliases"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_aliases"(text) TO "postgres";
