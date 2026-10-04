CREATE OR REPLACE FUNCTION public.get_workspace_model_last_used (
  p_team_id uuid,
  p_since   timestamp with time zone
)
  RETURNS TABLE (
    model_id     text,
    last_used_at timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    gr.model_id::text as model_id,
    max(gr.created_at) as last_used_at
  from private.v2_rpc_gateway_requests_compat gr
  where gr.team_id = p_team_id
    and gr.created_at >= p_since
    and gr.model_id is not null
    and gr.model_id <> ''
    and public.is_workspace_member(p_team_id)
  group by gr.model_id
  order by last_used_at desc;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_workspace_model_last_used"(uuid, timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_model_last_used"(uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_model_last_used"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_model_last_used"(uuid, timestamp WITH time zone) TO "postgres";
