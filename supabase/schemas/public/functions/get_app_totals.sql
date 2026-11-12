CREATE OR REPLACE FUNCTION public.get_app_totals (
  p_app_id uuid
)
  RETURNS TABLE (
    total_tokens   bigint,
    total_requests bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as total_tokens,
    count(*)::bigint as total_requests
  from private.v2_rpc_gateway_requests_compat gr
  where gr.app_id = p_app_id
    and gr.success = true;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_app_totals"(uuid) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_app_totals"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_app_totals"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_app_totals"(uuid) TO "postgres";
