CREATE OR REPLACE FUNCTION public.normalize_v2_service_tier (
  p_value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case lower(nullif(trim(p_value), ''))
    when 'default' then 'standard'
    when 'fast' then 'priority'
    when 'priority' then 'priority'
    when 'standard' then 'standard'
    when 'ultrafast' then 'ultrafast'
    when 'flex' then 'flex'
    when 'batch' then 'batch'
    else null
  end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."normalize_v2_service_tier"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."normalize_v2_service_tier"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_v2_service_tier"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."normalize_v2_service_tier"(text) FROM PUBLIC, "anon", "authenticated";
