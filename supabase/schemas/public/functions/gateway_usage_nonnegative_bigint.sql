CREATE OR REPLACE FUNCTION public.gateway_usage_nonnegative_bigint (
  p_value numeric
)
  RETURNS bigint
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select greatest(coalesce(floor(p_value), 0), 0)::bigint;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_nonnegative_bigint"(numeric) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_nonnegative_bigint"(numeric) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_usage_nonnegative_bigint"(numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_usage_nonnegative_bigint"(numeric) TO "postgres";
