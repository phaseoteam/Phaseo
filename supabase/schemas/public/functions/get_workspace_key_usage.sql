CREATE OR REPLACE FUNCTION public.get_workspace_key_usage (
  p_workspace_id uuid,
  p_day_start    timestamp with time zone
)
  RETURNS TABLE (
    key_id              uuid,
    daily_request_count bigint,
    daily_cost_nanos    bigint,
    last_used_at        timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select
    gr.key_id,
    count(*) filter (where gr.created_at >= p_day_start)::bigint as daily_request_count,
    coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= p_day_start), 0)::bigint as daily_cost_nanos,
    max(gr.created_at) as last_used_at
  from private.v2_rpc_gateway_requests_compat gr
  where gr.workspace_id = p_workspace_id
    and gr.key_id is not null
    and gr.success is true
    and public.is_workspace_member(p_workspace_id)
  group by gr.key_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_workspace_key_usage"(uuid, timestamp WITH time zone) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_key_usage"(uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_key_usage"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_key_usage"(uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_key_usage"(uuid, timestamp WITH time zone) FROM PUBLIC, "anon";
