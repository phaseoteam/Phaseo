CREATE OR REPLACE FUNCTION public.get_gateway_jobs_rollup (
  p_team       uuid,
  p_limit      integer DEFAULT 100,
  p_offset     integer DEFAULT 0,
  p_kind       text    DEFAULT NULL::text,
  p_status     text    DEFAULT NULL::text,
  p_session_id text    DEFAULT NULL::text,
  p_provider   text    DEFAULT NULL::text
)
  RETURNS TABLE (
    job_id             uuid,
    kind               text,
    internal_id        text,
    request_id         text,
    session_id         text,
    app_id             uuid,
    provider           text,
    model              text,
    status             text,
    billed_at          timestamp with time zone,
    created_at         timestamp with time zone,
    updated_at         timestamp with time zone,
    request_created_at timestamp with time zone,
    request_endpoint   text,
    request_model_id   text,
    request_cost_nanos bigint,
    request_cost_usd   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with filtered_ops as (
    select op.*
    from public.gateway_async_operations op
    where op.workspace_id = p_team
      and (p_kind is null or op.kind = p_kind)
      and (p_status is null or op.status = p_status)
      and (p_session_id is null or op.session_id = p_session_id)
      and (p_provider is null or op.provider = p_provider)
  ),
  request_lookup as (
    select
      gr.workspace_id,
      gr.request_id,
      gr.created_at,
      gr.endpoint,
      gr.model_id,
      gr.cost_nanos,
      row_number() over (
        partition by gr.workspace_id, gr.request_id
        order by gr.created_at desc
      ) as rn
    from private.v2_rpc_gateway_requests_compat gr
    where gr.workspace_id = p_team
  )
  select
    op.id as job_id,
    op.kind,
    op.internal_id,
    op.request_id,
    op.session_id,
    op.app_id,
    op.provider,
    op.model,
    op.status,
    op.billed_at,
    op.created_at,
    op.updated_at,
    req.created_at as request_created_at,
    req.endpoint as request_endpoint,
    req.model_id as request_model_id,
    req.cost_nanos as request_cost_nanos,
    coalesce(req.cost_nanos, 0)::numeric / 1e9 as request_cost_usd
  from filtered_ops op
  left join request_lookup req
    on req.workspace_id = op.workspace_id
   and req.request_id = op.request_id
   and req.rn = 1
  order by op.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_gateway_jobs_rollup"(uuid, integer, integer, text, text, text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_jobs_rollup"(uuid, integer, integer, text, text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_gateway_jobs_rollup"(uuid, integer, integer, text, text, text, text) IS 'Workspace-scoped async jobs rollup from gateway_async_operations with optional linkage to source gateway request.';

REVOKE ALL ON FUNCTION "public"."get_gateway_jobs_rollup"(uuid, integer, integer, text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_jobs_rollup"(uuid, integer, integer, text, text, text, text) TO "postgres";
