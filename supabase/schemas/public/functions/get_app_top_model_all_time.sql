CREATE OR REPLACE FUNCTION public.get_app_top_model_all_time (
  p_app_id uuid
)
  RETURNS TABLE (
    model_id text,
    provider text,
    tokens   bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    coalesce(gr.model_id, 'Unknown model') as model_id,
    gr.provider as provider,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
  from private.v2_rpc_gateway_requests_compat gr
  where gr.app_id = p_app_id
    and gr.success = true
  group by 1, 2
  order by tokens desc
  limit 1;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_app_top_model_all_time"(uuid) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_app_top_model_all_time"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_app_top_model_all_time"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_app_top_model_all_time"(uuid) TO "postgres";
