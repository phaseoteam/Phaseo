CREATE OR REPLACE FUNCTION public.get_app_top_models (
  p_app_id uuid,
  p_days   integer DEFAULT 28,
  p_limit  integer DEFAULT 6
)
  RETURNS TABLE (
    model_id text,
    provider text,
    tokens   bigint,
    requests bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    coalesce(gr.model_id, 'Unknown model') as model_id,
    gr.provider as provider,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    count(*)::bigint as requests
  from private.v2_rpc_gateway_requests_compat gr
  where gr.app_id = p_app_id
    and gr.success = true
    and gr.created_at >= now() - (p_days::text || ' days')::interval
  group by 1, 2
  order by tokens desc, requests desc
  limit p_limit;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_app_top_models"(uuid, integer, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_app_top_models"(uuid, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_app_top_models"(uuid, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_app_top_models"(uuid, integer, integer) TO "postgres";
