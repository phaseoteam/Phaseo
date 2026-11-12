CREATE OR REPLACE FUNCTION public.get_gateway_sessions_rollup (
  p_team     uuid,
  p_from     timestamp with time zone,
  p_to       timestamp with time zone,
  p_limit    integer                  DEFAULT 100,
  p_offset   integer                  DEFAULT 0,
  p_app_id   uuid                     DEFAULT NULL::uuid,
  p_model_id text                     DEFAULT NULL::text,
  p_provider text                     DEFAULT NULL::text
)
  RETURNS TABLE (
    session_id       text,
    request_count    bigint,
    total_cost_nanos numeric,
    total_cost_usd   numeric,
    first_request_at timestamp with time zone,
    last_request_at  timestamp with time zone,
    app_ids          uuid[],
    model_ids        text[],
    provider_ids     text[],
    end_user_ids     text[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with filtered as (
    select gr.*
    from private.v2_rpc_gateway_requests_compat gr
    where gr.workspace_id = p_team
      and gr.created_at >= p_from
      and gr.created_at <= p_to
      and gr.session_id is not null
      and length(trim(gr.session_id)) > 0
      and (p_app_id is null or gr.app_id = p_app_id)
      and (p_model_id is null or gr.model_id = p_model_id)
      and (p_provider is null or gr.provider = p_provider)
  ),
  grouped as (
    select
      gr.session_id,
      count(*)::bigint as request_count,
      coalesce(sum(gr.cost_nanos::numeric), 0) as total_cost_nanos,
      min(gr.created_at) as first_request_at,
      max(gr.created_at) as last_request_at,
      array_remove(array_agg(distinct gr.app_id), null) as app_ids,
      array_remove(array_agg(distinct gr.model_id), null) as model_ids,
      array_remove(array_agg(distinct gr.provider), null) as provider_ids,
      array_remove(array_agg(distinct gr.end_user_id), null) as end_user_ids
    from filtered gr
    group by gr.session_id
  )
  select
    g.session_id,
    g.request_count,
    g.total_cost_nanos,
    g.total_cost_nanos / 1e9 as total_cost_usd,
    g.first_request_at,
    g.last_request_at,
    g.app_ids,
    g.model_ids,
    g.provider_ids,
    g.end_user_ids
  from grouped g
  order by g.last_request_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."get_gateway_sessions_rollup"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer, integer, uuid, text, text)
  TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_sessions_rollup"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer, integer, uuid, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_gateway_sessions_rollup"(uuid, timestamp with time zone, timestamp
  with time zone, integer, integer, uuid, text, text) IS 'Workspace-scoped session rollup across gateway_requests with totals and distinct app/model/provider sets.';

REVOKE ALL ON FUNCTION "public"."get_gateway_sessions_rollup"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer, integer, uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_sessions_rollup"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer, integer, uuid, text, text) TO "postgres";
